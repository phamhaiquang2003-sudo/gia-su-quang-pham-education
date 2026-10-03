import App from "@/App";
import { useAccount } from "@/lib/use-account";

export default function HomePage() {
  const session = useAccount();
  return (
    <App
      profile={session.profile}
      accountLoading={session.loading}
      accountMessage={session.error}
      onLogout={() => session.logout(import.meta.env.BASE_URL)}
    />
  );
}
