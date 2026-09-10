"use client";

export const AVATARS = ["🦊", "🐼", "🐯", "🐙", "🦁", "🐸", "🐵", "🐨"];

export function AvatarPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="segmented" aria-label="选择头像">
    {AVATARS.map((avatar) => <button type="button" key={avatar} className={`segment ${value === avatar ? "active" : ""}`} onClick={() => onChange(avatar)} aria-label={`头像 ${avatar}`}>{avatar}</button>)}
  </div>;
}
