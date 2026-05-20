import CoreImage
import CoreVideo
import ExpoModulesCore
import UIKit
import Vision

enum VisionMaskError: Error {
  case unsupportedOS
  case missingSource
  case decodeFailed
  case maskRequestFailed(String)
  case noForeground
  case compositeFailed
  case writeFailed
}

public class ExpoVisionMaskModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoVisionMask")

    Function("isSupported") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    AsyncFunction("removeBackground") { (params: RemoveBackgroundParams, promise: Promise) in
      Task {
        do {
          let output = try await Self.performRemoveBackground(params: params)
          promise.resolve([
            "uri": output.url.absoluteString,
            "width": output.width,
            "height": output.height,
          ])
        } catch {
          promise.reject("ExpoVisionMask", "\(error)")
        }
      }
    }
  }

  // MARK: - Constants

  /// Mask pixels above this value are treated as foreground when computing the
  /// bounding box and counting per-instance areas. 128 ≈ 50% confidence.
  private static let maskThreshold: UInt8 = 128

  /// An instance is kept if its mask area is at least this fraction of the
  /// largest instance's area. Catches multi-part slab masks while dropping
  /// small artifacts like surface/cardboard/shadow fragments.
  private static let instanceAreaFloorFraction: Double = 0.2

  /// Padding applied around the foreground bounding box before cropping the
  /// final image, expressed as a fraction of the bbox's width/height.
  private static let cropPaddingFraction: CGFloat = 0.04

  private struct MaskOutput {
    let url: URL
    let width: Int
    let height: Int
  }

  private static func performRemoveBackground(params: RemoveBackgroundParams) async throws -> MaskOutput {
    guard #available(iOS 17.0, *) else { throw VisionMaskError.unsupportedOS }

    let sourceURL = try resolveSourceURL(params.sourceUri)
    guard let uiImage = UIImage(contentsOfFile: sourceURL.path)?.normalizedOrientation(),
          let cgImage = uiImage.cgImage else {
      throw VisionMaskError.decodeFailed
    }

    let ciInput = CIImage(cgImage: cgImage)
    let inputExtent = ciInput.extent

    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw VisionMaskError.maskRequestFailed(error.localizedDescription)
    }

    guard let result = request.results?.first, !result.allInstances.isEmpty else {
      throw VisionMaskError.noForeground
    }

    // Drop small/extraneous instances so we only mask the slab itself, not
    // surrounding shadows or surface fragments.
    let chosenInstances = pickPrimaryInstances(from: result)

    let maskBuffer = try result.generateScaledMaskForImage(
      forInstances: chosenInstances,
      from: handler
    )

    // Bounding box from the RAW mask buffer. This is the source of truth
    // for foreground presence — if morphology below over-erodes we'll still
    // have a valid bbox to crop with.
    guard let rasterBBox = maskRasterBoundingBox(
      buffer: maskBuffer,
      threshold: maskThreshold
    ) else {
      throw VisionMaskError.noForeground
    }
    let bufferW = CGFloat(CVPixelBufferGetWidth(maskBuffer))
    let bufferH = CGFloat(CVPixelBufferGetHeight(maskBuffer))
    let scaleX = inputExtent.width / max(bufferW, 1)
    let scaleY = inputExtent.height / max(bufferH, 1)
    let bboxInImage = CGRect(
      x: rasterBBox.minX * scaleX,
      y: rasterBBox.minY * scaleY,
      width: rasterBBox.width * scaleX,
      height: rasterBBox.height * scaleY
    )

    var ciMask = CIImage(cvPixelBuffer: maskBuffer)
    let maskExtent = ciMask.extent
    if maskExtent.width > 0,
       maskExtent.height > 0,
       (maskExtent.width != inputExtent.width || maskExtent.height != inputExtent.height) {
      let sx = inputExtent.width / maskExtent.width
      let sy = inputExtent.height / maskExtent.height
      ciMask = ciMask.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
    }

    // Morphological opening: erode then dilate. Erosion removes thin halos
    // and small specks (shadow edges, reflections, cardboard fragments
    // touching the slab); dilation restores the slab to its original size
    // without bringing back the cleaned-up bits. Radius is conservative so
    // we don't accidentally erase a small slab capture.
    let minDim = min(inputExtent.width, inputExtent.height)
    let morphologyRadius: Double = max(Double(minDim) * 0.004, 3.0)
    let cleanedMask = ciMask
      .applyingFilter("CIMorphologyMinimum", parameters: [
        "inputRadius": morphologyRadius,
      ])
      .applyingFilter("CIMorphologyMaximum", parameters: [
        "inputRadius": morphologyRadius,
      ])
      .cropped(to: inputExtent)

    // Replicate the single-channel mask value into R, G, B, A so the blend
    // filter reads the same value regardless of channel.
    let normalize = CIFilter(name: "CIColorMatrix")!
    normalize.setValue(cleanedMask, forKey: kCIInputImageKey)
    let one = CIVector(x: 1, y: 0, z: 0, w: 0)
    normalize.setValue(one, forKey: "inputRVector")
    normalize.setValue(one, forKey: "inputGVector")
    normalize.setValue(one, forKey: "inputBVector")
    normalize.setValue(one, forKey: "inputAVector")
    guard let rgbaMask = normalize.outputImage else {
      throw VisionMaskError.compositeFailed
    }

    let background: CIImage
    if params.whiteBackground {
      background = CIImage(color: CIColor.white).cropped(to: inputExtent)
    } else {
      background = CIImage(color: CIColor.clear).cropped(to: inputExtent)
    }

    let blendFilter = CIFilter(name: "CIBlendWithMask")!
    blendFilter.setValue(ciInput, forKey: kCIInputImageKey)
    blendFilter.setValue(background, forKey: kCIInputBackgroundImageKey)
    blendFilter.setValue(rgbaMask, forKey: kCIInputMaskImageKey)
    guard let composited = blendFilter.outputImage?.cropped(to: inputExtent) else {
      throw VisionMaskError.compositeFailed
    }

    // Inset the bbox outward by the padding fraction, then convert from
    // raster (top-left origin) to CIImage (bottom-left origin) coordinates.
    let padX = bboxInImage.width * cropPaddingFraction
    let padY = bboxInImage.height * cropPaddingFraction
    let paddedTopLeft = CGRect(
      x: max(bboxInImage.minX - padX, 0),
      y: max(bboxInImage.minY - padY, 0),
      width: min(bboxInImage.width + 2 * padX, inputExtent.width - max(bboxInImage.minX - padX, 0)),
      height: min(bboxInImage.height + 2 * padY, inputExtent.height - max(bboxInImage.minY - padY, 0))
    )
    let cropCI = CGRect(
      x: paddedTopLeft.minX,
      y: inputExtent.height - paddedTopLeft.maxY,
      width: paddedTopLeft.width,
      height: paddedTopLeft.height
    )

    let finalImage = composited.cropped(to: cropCI)
    guard finalImage.extent.width > 0, finalImage.extent.height > 0 else {
      throw VisionMaskError.compositeFailed
    }

    let context = CIContext(options: [.useSoftwareRenderer: false])
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    let outputURL = try makeOutputURL(extension: params.whiteBackground ? "jpg" : "png")

    if params.whiteBackground {
      guard let cgOut = context.createCGImage(finalImage, from: finalImage.extent) else {
        throw VisionMaskError.writeFailed
      }
      let outImage = UIImage(cgImage: cgOut, scale: uiImage.scale, orientation: .up)
      guard let data = outImage.jpegData(compressionQuality: 0.92) else {
        throw VisionMaskError.writeFailed
      }
      try data.write(to: outputURL)
    } else {
      do {
        try context.writePNGRepresentation(
          of: finalImage,
          to: outputURL,
          format: .RGBA8,
          colorSpace: colorSpace,
          options: [:]
        )
      } catch {
        throw VisionMaskError.writeFailed
      }
    }

    let dim = imageDimensions(at: outputURL)
    return MaskOutput(url: outputURL, width: dim.width, height: dim.height)
  }

  // MARK: - Instance selection

  /// Returns the set of instance indices that should be treated as the slab's
  /// foreground. When Vision returns more than one instance, the largest is
  /// always kept, plus any instance whose mask area is at least
  /// `instanceAreaFloorFraction` of the largest. This lets us keep slabs that
  /// Vision split into multiple instances while dropping small artifacts.
  @available(iOS 17.0, *)
  private static func pickPrimaryInstances(from result: VNInstanceMaskObservation) -> IndexSet {
    let allInstances = result.allInstances
    if allInstances.count <= 1 {
      return allInstances
    }

    var areas: [(idx: Int, area: Int)] = []
    for idx in allInstances {
      // Use the non-scaled mask for area comparison — it lives at Vision's
      // internal resolution (~256px on the long edge) and is much faster to
      // iterate than the full scaled mask.
      guard let mask = try? result.generateMask(forInstances: IndexSet([idx])) else {
        continue
      }
      let area = countAbove(buffer: mask, threshold: maskThreshold)
      areas.append((idx: idx, area: area))
    }

    guard let largest = areas.max(by: { $0.area < $1.area }), largest.area > 0 else {
      return allInstances
    }
    let cutoff = max(Int(Double(largest.area) * instanceAreaFloorFraction), 1)
    let kept = areas.filter { $0.area >= cutoff }.map { $0.idx }
    if kept.isEmpty { return IndexSet([largest.idx]) }
    return IndexSet(kept)
  }

  // MARK: - Pixel-buffer helpers

  private static func countAbove(buffer: CVPixelBuffer, threshold: UInt8) -> Int {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }
    let w = CVPixelBufferGetWidth(buffer)
    let h = CVPixelBufferGetHeight(buffer)
    let stride = CVPixelBufferGetBytesPerRow(buffer)
    let format = CVPixelBufferGetPixelFormatType(buffer)

    var count = 0
    if format == kCVPixelFormatType_OneComponent32Float {
      let thresholdF = Float(threshold) / 255.0
      for y in 0..<h {
        let row = base.advanced(by: y * stride).assumingMemoryBound(to: Float.self)
        for x in 0..<w where row[x] > thresholdF {
          count += 1
        }
      }
    } else {
      for y in 0..<h {
        let row = base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self)
        for x in 0..<w where row[x] > threshold {
          count += 1
        }
      }
    }
    return count
  }

  /// Bounding box of mask pixels above threshold, in pixel-buffer
  /// (top-left origin) coordinates.
  private static func maskRasterBoundingBox(buffer: CVPixelBuffer, threshold: UInt8) -> CGRect? {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
    let w = CVPixelBufferGetWidth(buffer)
    let h = CVPixelBufferGetHeight(buffer)
    let stride = CVPixelBufferGetBytesPerRow(buffer)
    let format = CVPixelBufferGetPixelFormatType(buffer)

    var minX = w
    var maxX = -1
    var minY = h
    var maxY = -1

    if format == kCVPixelFormatType_OneComponent32Float {
      let thresholdF = Float(threshold) / 255.0
      for y in 0..<h {
        let row = base.advanced(by: y * stride).assumingMemoryBound(to: Float.self)
        for x in 0..<w where row[x] > thresholdF {
          if x < minX { minX = x }
          if x > maxX { maxX = x }
          if y < minY { minY = y }
          if y > maxY { maxY = y }
        }
      }
    } else {
      for y in 0..<h {
        let row = base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self)
        for x in 0..<w where row[x] > threshold {
          if x < minX { minX = x }
          if x > maxX { maxX = x }
          if y < minY { minY = y }
          if y > maxY { maxY = y }
        }
      }
    }

    guard maxX >= minX, maxY >= minY else { return nil }
    return CGRect(
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    )
  }

  // MARK: - File helpers

  private static func resolveSourceURL(_ uri: String) throws -> URL {
    if uri.hasPrefix("file://") {
      guard let url = URL(string: uri) else { throw VisionMaskError.missingSource }
      return url
    }
    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }
    guard let url = URL(string: uri) else { throw VisionMaskError.missingSource }
    return url
  }

  private static func makeOutputURL(extension ext: String) throws -> URL {
    let tmp = FileManager.default.temporaryDirectory
    let dir = tmp.appendingPathComponent("vision-mask", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let id = UUID().uuidString
    return dir.appendingPathComponent("\(id).\(ext)")
  }

  private static func imageDimensions(at url: URL) -> (width: Int, height: Int) {
    if let image = UIImage(contentsOfFile: url.path) {
      return (Int(image.size.width * image.scale), Int(image.size.height * image.scale))
    }
    return (0, 0)
  }
}

struct RemoveBackgroundParams: Record {
  @Field var sourceUri: String = ""
  @Field var whiteBackground: Bool = false
}

private extension UIImage {
  /// Normalizes EXIF orientation so Vision sees an upright image.
  func normalizedOrientation() -> UIImage? {
    if imageOrientation == .up { return self }
    UIGraphicsBeginImageContextWithOptions(size, false, scale)
    defer { UIGraphicsEndImageContext() }
    draw(in: CGRect(origin: .zero, size: size))
    return UIGraphicsGetImageFromCurrentImageContext()
  }
}
