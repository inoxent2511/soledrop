/** A complete uploaded banner uses mode "full"; rows without it retain their legacy layout. */
export type HomeImage = { src: string; alt: string; width?: number; height?: number; mode?: "full"; href?: string }
export type HomeContent = {
  announcement: string
  heading: [string, string, string, string]
  description: string
  buttons: { label: string; href: string }[]
  slides: HomeImage[]
  categories: { title: [string, string]; href: string; image: HomeImage }[]
  instagram: { href: string; handle: string; images: HomeImage[] }
}
export type HomeRecord = { content: HomeContent; updatedAt: string }

export const emptyHome: HomeContent = {
  announcement: "", heading: ["", "", "", ""], description: "", buttons: [], slides: [], categories: [],
  instagram: { href: "https://www.instagram.com/", handle: "", images: [] },
}
