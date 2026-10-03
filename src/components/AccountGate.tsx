import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { AccountProfile } from "@/lib/accounts";

interface Props {
  profile: AccountProfile | null;
  loading: boolean;
  error: string;
  admin?: boolean;
  children: ReactNode;
}

export default function AccountGate({
  profile,
  loading,
  error,
  admin,
  children,
}: Props) {
  if (!loading && profile && (!admin || profile.role === "admin"))
    return children;
  return (
    <main className="account-page flex min-h-svh items-center justify-center p-5">
      <section
        className="account-card w-full max-w-lg text-center"
        aria-busy={loading}
      >
        <img
          src={`${import.meta.env.BASE_URL}logo-lumenpelagi.png`}
          alt="PHQ Education"
          className="mx-auto mb-5 size-16"
        />
        <h1 className="text-2xl font-semibold">
          {loading
            ? "Đang kiểm tra tài khoản…"
            : admin
              ? "Trang quản trị"
              : "Trang học sinh"}
        </h1>
        <p role="status" className="my-5 leading-relaxed text-slate-600">
          {loading
            ? "Vui lòng chờ trong giây lát."
            : error ||
              (profile
                ? "Chỉ tài khoản quản trị được truy cập trang này."
                : "Vui lòng đăng nhập bằng tài khoản được giáo viên cấp.")}
        </p>
        {!loading && (
          <Button asChild>
            <a href={`${import.meta.env.BASE_URL}dang-nhap.html`}>
              Đến trang đăng nhập
            </a>
          </Button>
        )}
        <a
          href={import.meta.env.BASE_URL}
          className="mt-5 block text-sm underline"
        >
          Về trang chủ
        </a>
      </section>
    </main>
  );
}
