/**
 * Size Guide charts (D-058, the owner's reference charts): Brand New and Pre-Loved each have their
 * own men's and women's conversions. Values are copied from the owner's images as given; ranges
 * such as "40-41" are half-EU sizes common on older pairs.
 */
import type { SizeChart } from "@/server/catalog/types"

export type SizeGuideId = "new" | "preloved"

export type SizeTable = {
  id: "men" | "women"
  title: string
  /** Column keys in display order; the first is the row heading (EU). */
  columns: { key: string; label: string }[]
  rows: Record<string, string>[]
}

export type SizeGuide = {
  id: SizeGuideId
  label: string
  summary: string
  note: string
  tables: SizeTable[]
}

const brandNewColumns = [
  { key: "eu", label: "EU" },
  { key: "us", label: "US" },
  { key: "uk", label: "UK" },
  { key: "cm", label: "CM" },
]

const preLovedColumns = [
  { key: "eu", label: "EU" },
  { key: "uk", label: "UK / PAK" },
  { key: "us", label: "US" },
]

/** [eu, us, uk, cm] → row. */
const brandNewRows = (rows: [string, string, string, string][]) =>
  rows.map(([eu, us, uk, cm]) => ({ eu, us, uk, cm }))

/** [eu, uk, us] → row. */
const preLovedRows = (rows: [string, string, string][]) =>
  rows.map(([eu, uk, us]) => ({ eu, uk, us }))

export const sizeGuides: SizeGuide[] = [
  {
    id: "new",
    label: "Brand New",
    summary: "EU · US · UK · CM",
    note: "Brand-new pairs are listed in EU sizes. Foot length in centimetres is the surest match.",
    tables: [
      {
        id: "men",
        title: "Men",
        columns: brandNewColumns,
        rows: brandNewRows([
          ["40", "7", "6", "25"],
          ["41", "8", "7", "26"],
          ["42", "8.5", "7.5", "26.5"],
          ["43", "9", "8.5", "27"],
          ["44", "10", "9", "28"],
          ["45", "11", "10", "29"],
          ["46", "12", "11", "30"],
          ["47", "13", "12", "31"],
        ]),
      },
      {
        id: "women",
        title: "Women",
        columns: brandNewColumns,
        rows: brandNewRows([
          ["36", "5.5", "3", "22"],
          ["37", "6", "3.5", "23"],
          ["37.5", "6.5", "4", "23.5"],
          ["38", "7", "4.5", "24"],
          ["39", "8", "5.5", "25"],
          ["40", "8.5", "6", "25"],
          ["41", "9", "7", "26"],
          ["42", "10", "7.5", "27"],
        ]),
      },
    ],
  },
  {
    id: "preloved",
    label: "Pre-Loved",
    summary: "EU · UK / PAK · US",
    note: "Every pre-loved listing shows the size printed on its tag. Find that size here to compare.",
    tables: [
      {
        id: "men",
        title: "Men",
        columns: preLovedColumns,
        rows: preLovedRows([
          ["38", "5.5", "6"],
          ["39", "6", "6.5"],
          ["40", "6.5", "7"],
          ["40-41", "7", "7.5"],
          ["41", "7", "8"],
          ["41-42", "7.5", "8.5"],
          ["42", "8", "9"],
          ["42-43", "8.5", "9.5"],
          ["43", "9", "10"],
          ["43-44", "10", "10.5"],
          ["44", "10", "11"],
          ["44-45", "10.5", "11.5"],
          ["45", "11", "12"],
          ["46", "12", "13"],
          ["47", "12.5", "14"],
          ["48", "13.5", "15"],
          ["49", "14", "16"],
        ]),
      },
      {
        id: "women",
        title: "Women",
        columns: preLovedColumns,
        rows: preLovedRows([
          ["35", "2", "4"],
          ["35", "2.5", "4.5"],
          ["35-36", "3", "5"],
          ["36", "3.5", "5.5"],
          ["36-37", "4", "6"],
          ["37", "4.5", "6.5"],
          ["37-38", "5", "7"],
          ["38", "5.5", "7.5"],
          ["38-39", "6", "8"],
          ["39", "6.5", "8.5"],
          ["39-40", "7", "9"],
          ["40", "7.5", "9.5"],
          ["40-41", "8", "10"],
          ["41", "8.5", "10.5"],
          ["41-42", "9", "11"],
          ["42", "9.5", "11.5"],
          ["42-43", "10", "12"],
        ]),
      },
    ],
  },
]

/** Brand New men's chart keyed by EU size: the UK/US/CM labels the catalogue gives every new pair. */
export const mensSizeByEu: Record<string, SizeChart> = Object.fromEntries(
  sizeGuides[0].tables[0].rows.map((row) => [
    row.eu,
    { eu: row.eu, uk: row.uk, us: row.us, cm: row.cm },
  ])
)
