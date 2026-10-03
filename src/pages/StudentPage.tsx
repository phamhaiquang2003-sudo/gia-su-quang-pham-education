import { useState } from "react";
import AccountGate from "@/components/AccountGate";
import { accountError } from "@/lib/accounts";
import { useAccount } from "@/lib/use-account";

export default function StudentPage() {
  const session = useAccount();
  const [error, setError] = useState("");
  return (
    <AccountGate {...session}>
      <main className="account-page min-h-svh px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <a
              href={import.meta.env.BASE_URL}
              className="flex items-center gap-3 font-semibold"
            >
              <img
                src={`${import.meta.env.BASE_URL}logo-lumenpelagi.png`}
                alt=""
                className="size-12"
              />
              PHQ Education
            </a>
            <button
              className="account-button-secondary"
              onClick={() =>
                void session
                  .logout()
                  .catch((failure) => setError(accountError(failure)))
              }
            >
              Đăng xuất
            </button>
          </header>
          <section className="account-card">
            <p className="mb-2 text-sm text-slate-500">Trang học sinh</p>
            <h1 className="text-2xl font-bold">
              Xin chào, {session.profile?.displayName}!
            </h1>
            <p className="mt-3 text-slate-600">
              Bạn đã đăng nhập bằng tài khoản @{session.profile?.username} được
              giáo viên cấp.
            </p>
            <h2 className="mb-3 mt-8 text-lg font-semibold">Lớp học của bạn</h2>
            {session.profile?.classIds?.length ? (
              <ul className="space-y-2">
                {session.profile.classIds.map((id) => (
                  <li key={id} className="rounded-lg bg-slate-100 p-3">
                    {id}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-slate-100 p-4 text-sm leading-relaxed text-slate-600">
                Giáo viên sẽ cập nhật lớp học và tài liệu cho tài khoản của bạn.
              </p>
            )}
            {session.profile?.role === "admin" && (
              <a
                href={`${import.meta.env.BASE_URL}quan-tri.html`}
                className="account-button mt-6"
              >
                Mở trang quản trị
              </a>
            )}
            {error && (
              <p role="alert" className="mt-4 text-red-700">
                {error}
              </p>
            )}
          </section>
        </div>
      </main>
    </AccountGate>
  );
}
