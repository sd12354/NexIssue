import type { NextPageContext } from "next";

type ErrorProps = {
  statusCode: number;
};

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#0D0D12",
        color: "#F5F5F7",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
        {statusCode ? `Error ${statusCode}` : "Application error"}
      </h1>
      <p style={{ color: "#8E8E93" }}>
        {statusCode === 404
          ? "This page could not be found."
          : "Something went wrong."}
      </p>
      <a
        href="/"
        style={{
          marginTop: "1.5rem",
          padding: "0.75rem 1.25rem",
          borderRadius: "12px",
          background: "#7C5CFF",
          color: "#F5F5F7",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Go home
      </a>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default ErrorPage;
