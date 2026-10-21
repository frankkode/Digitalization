import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1>Developer login</h1>
      <p className="sub">The dashboard and outbox contain client data and are only available to the developer.</p>
      <LoginForm next={next ?? "/dashboard"} />
    </>
  );
}
