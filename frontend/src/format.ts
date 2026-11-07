export const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN")}`;

/** Short form for big numbers on cards: ₹2.5 L, ₹1.2 Cr. */
export const lakh = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(1)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)} L` : inr(v));
