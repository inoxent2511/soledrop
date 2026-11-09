/** Lowercase exactly as the fixture repository does; SQL collations differ. */
export function orderSearchText(input: { number: string; email: string; phone: string; fullName: string }) {
  const [number, email, phone, name] = [input.number, input.email, input.phone, input.fullName].map((value) => value.toLowerCase())
  return {
    searchText: [number, email, phone, name].join("\0"),
    numberBytes: Buffer.byteLength(number), emailBytes: Buffer.byteLength(email), phoneBytes: Buffer.byteLength(phone),
    phoneDigits: input.phone.replace(/\D/g, ""),
  }
}
