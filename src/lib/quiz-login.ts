import { subjects } from "./subjects";

export function quizLoginHref(returnTo: string) {
  return `${import.meta.env.BASE_URL}dang-nhap.html?${new URLSearchParams({ returnTo })}`;
}

export function quizReturnDestination() {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  if (!value) return null;
  try {
    const destination = new URL(value, window.location.href);
    const exercise = new URL(
      `${import.meta.env.BASE_URL}bai-tap.html`,
      window.location.href,
    );
    const subject = destination.searchParams.get("mon");
    const id = destination.searchParams.get("de");
    if (
      destination.origin !== exercise.origin ||
      destination.pathname !== exercise.pathname ||
      destination.username ||
      destination.password ||
      !subjects.some((item) => item.id === subject) ||
      !id ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(id)
    )
      return null;
    return `${exercise.pathname}?${new URLSearchParams({ mon: subject!, de: id })}`;
  } catch {
    return null;
  }
}
