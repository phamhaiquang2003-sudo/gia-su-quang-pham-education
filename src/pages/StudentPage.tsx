import App from "@/App";
import AccountGate from "@/components/AccountGate";
import { useAccount } from "@/lib/use-account";

export default function StudentPage() {
  const session = useAccount();
  return (
    <AccountGate {...session}>
      <App
        profile={session.profile}
        onLogout={() => session.logout(import.meta.env.BASE_URL)}
      />
    </AccountGate>
  );
}
