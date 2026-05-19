import { useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppIcon } from "./AppIcon";
import { colors } from "../theme/colors";
import { authIcons, type IconName } from "../theme/icons";

type AuthFormProps = {
  title: string;
  subtitle: string;
  submitLabel: string;
  submitIcon: IconName;
  footer?: ReactNode;
  onSubmit: (email: string, password: string) => Promise<void>;
};

function IconTextInput({
  icon,
  ...props
}: ComponentProps<typeof TextInput> & { icon: IconName }) {
  return (
    <View style={styles.inputRow}>
      <AppIcon name={icon} size={20} />
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function AuthForm({
  title,
  subtitle,
  submitLabel,
  submitIcon,
  footer,
  onSubmit,
}: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        accessibilityLabel="NexIssue logo"
        source={require("../../assets/logo.png")}
        style={styles.logo}
      />

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <IconTextInput
        autoCapitalize="none"
        autoComplete="email"
        icon={authIcons.email}
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <IconTextInput
        autoCapitalize="none"
        autoComplete="password"
        icon={authIcons.password}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? (
        <View style={styles.errorRow}>
          <AppIcon name={authIcons.error} size={18} color={colors.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={submitting}
        onPress={handleSubmit}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          submitting && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <View style={styles.buttonContent}>
            <AppIcon name={submitIcon} size={20} color={colors.text} />
            <Text style={styles.buttonLabel}>{submitLabel}</Text>
          </View>
        )}
      </Pressable>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
  },
  logo: {
    alignSelf: "center",
    height: 64,
    marginBottom: 8,
    resizeMode: "contain",
    width: 64,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    marginBottom: 8,
    textAlign: "center",
  },
  inputRow: {
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
  },
  errorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  error: {
    color: colors.danger,
    flex: 1,
    fontSize: 14,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 16,
  },
  buttonPressed: {
    backgroundColor: colors.accentPressed,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    marginTop: 16,
  },
});
