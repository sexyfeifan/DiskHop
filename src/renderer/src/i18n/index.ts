import { zh } from './zh'
import { en } from './en'

export type Lang = 'zh' | 'en'
export type TranslationKey = keyof typeof zh

const translations = { zh, en } as const

export function getT(lang: Lang) {
  return (key: TranslationKey): string => translations[lang][key] as string
}
