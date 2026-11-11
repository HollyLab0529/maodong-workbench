/** 极简小猫线稿：用于空状态点缀（线描，非实心 logo） */
export default function CatMascot({ className = "" }) {
  return (
    <svg
      viewBox="0 0 72 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* 耳朵 */}
      <path d="M20 22 16 9l12 6" />
      <path d="M52 22 56 9 44 15" />
      {/* 脸（上宽下圆） */}
      <path d="M20 22c-4 3-6 8-6 12 0 11 10 19 22 19s22-8 22-19c0-4-2-9-6-12" />
      {/* 眯眼 */}
      <path d="M25 32c1.5-2 4.5-2 6 0" />
      <path d="M41 32c1.5-2 4.5-2 6 0" />
      {/* 鼻子 */}
      <path d="M36 38l-1.8 2h3.6L36 38Z" fill="currentColor" strokeWidth="1" />
      {/* ω 嘴 */}
      <path d="M32 43c1.2 1.8 2.8 1.8 4 0 1.2 1.8 2.8 1.8 4 0" />
      {/* 胡须 */}
      <path d="M12 34h8M13 40l7-1.5" />
      <path d="M52 34h8M52 38.5l7 1.5" />
    </svg>
  );
}
