"use client";

let context: AudioContext | undefined;
let speechTimer: ReturnType<typeof setTimeout> | undefined;

function chineseVoice(): SpeechSynthesisVoice | undefined {
  return window.speechSynthesis.getVoices().find((voice) => /^zh[-_]/i.test(voice.lang));
}

function audio(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function tone(frequency: number, duration: number, volume = 0.04, type: OscillatorType = "sine", delay = 0): void {
  const ctx = audio();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start); oscillator.stop(start + duration + 0.02);
}

function chipStrike(delay: number, pitch: number, volume: number): void {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const oscillatorGain = ctx.createGain();
  const noise = ctx.createBufferSource();
  const noiseFilter = ctx.createBiquadFilter();
  const noiseGain = ctx.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(pitch, start);
  oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.72, start + 0.045);
  oscillatorGain.gain.setValueAtTime(0.0001, start);
  oscillatorGain.gain.exponentialRampToValueAtTime(volume, start + 0.002);
  oscillatorGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.052);

  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.055), ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    const envelope = 1 - index / channel.length;
    channel[index] = (Math.random() * 2 - 1) * envelope;
  }
  noise.buffer = buffer;
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(pitch * 1.9, start);
  noiseFilter.Q.value = 3.8;
  noiseGain.gain.setValueAtTime(volume * 0.72, start);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.048);

  oscillator.connect(oscillatorGain).connect(ctx.destination);
  noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.06);
  noise.start(start);
  noise.stop(start + 0.06);
}

export function unlockSound(): void {
  tone(520, 0.06, 0.025);
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.resume();
  const primer = new SpeechSynthesisUtterance(" ");
  primer.lang = "zh-CN";
  primer.volume = 0;
  window.speechSynthesis.speak(primer);
}
export function playDeal(): void { tone(210, 0.045, 0.035, "triangle"); tone(185, 0.045, 0.03, "triangle", 0.07); }
export function playDealCard(): void { tone(172, 0.035, 0.018, "triangle"); tone(118, 0.055, 0.012, "sine", 0.018); }
export function playChip(): void {
  [0, 0.018, 0.043, 0.071, 0.104, 0.138].forEach((delay, index) => {
    chipStrike(delay, 720 + index * 86 + Math.random() * 110, 0.022 - index * 0.0015);
  });
}
export function playFold(): void { tone(180, 0.08, 0.025, "triangle"); }
export function playCheck(): void {
  tone(92, 0.07, 0.055, "triangle");
  tone(82, 0.075, 0.05, "triangle", 0.11);
}
export function playWin(): void {
  [392, 523, 659, 784].forEach((frequency, index) => tone(frequency, 0.2, 0.03, "sine", index * 0.085));
}
export function speakAction(action: string, amount?: number): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const value = amount && amount > 0 ? `，${Math.round(amount)}` : "";
  clearTimeout(speechTimer);
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  speechTimer = setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(`${action}${value}`);
    utterance.lang = "zh-CN";
    utterance.rate = 1.12;
    utterance.pitch = 0.96;
    utterance.volume = 0.88;
    const voice = chineseVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }, 90);
}
export function playSquid(): void { tone(520, 0.1, 0.035); tone(660, 0.12, 0.035, "sine", 0.09); tone(880, 0.16, 0.04, "sine", 0.18); }
export function playSettlement(): void { [392, 494, 587, 784].forEach((frequency, index) => tone(frequency, 0.22, 0.028, "sine", index * 0.09)); }
