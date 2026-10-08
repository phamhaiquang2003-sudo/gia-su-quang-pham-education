export type SchoolClassId =
  `lop-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`;

export const schoolClasses = Array.from({ length: 12 }, (_, index) => ({
  id: `lop-${index + 1}` as SchoolClassId,
  label: `Lớp ${index + 1}`,
}));

export function isSchoolClassId(value: unknown): value is SchoolClassId {
  return schoolClasses.some((schoolClass) => schoolClass.id === value);
}

export function schoolClassLabel(id: string) {
  return (
    schoolClasses.find((schoolClass) => schoolClass.id === id)?.label || id
  );
}
