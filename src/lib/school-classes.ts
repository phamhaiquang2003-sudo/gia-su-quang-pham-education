export type SchoolClassId = `lop-${6 | 7 | 8 | 9 | 10 | 11 | 12}`;

export const schoolClasses = Array.from({ length: 7 }, (_, index) => ({
  id: `lop-${index + 6}` as SchoolClassId,
  label: `Lớp ${index + 6}`,
}));

export function isSchoolClassId(value: unknown): value is SchoolClassId {
  return schoolClasses.some((schoolClass) => schoolClass.id === value);
}

export function schoolClassLabel(id: string) {
  return (
    schoolClasses.find((schoolClass) => schoolClass.id === id)?.label || id
  );
}
