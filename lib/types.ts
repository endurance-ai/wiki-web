// Plain TS row interfaces mirroring the wiki-schema tables.
// Field names are camelCase (SQL queries alias snake_case columns) so existing
// consumers (graph-utils, components, store) keep working unchanged after the
// Prisma -> pg migration. Mirrors the shape Prisma previously returned.

export interface BrandNode {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: Date;
  axisXLabel: string | null;
  axisYLabel: string | null;
}

export interface Brand {
  id: string;
  name: string;
  instagramHandle: string | null;
  thumbnailUrl: string | null;
  nodeId: string | null;
  xPosition: number | null;
  yPosition: number | null;
  createdAt: Date;
  updatedAt: Date;
  instagramUrl: string | null;
  feedThumbnails: string[];
}

export interface BrandKeyword {
  id: string;
  brandId: string;
  keyword: string;
}

export interface BrandRelation {
  id: string;
  brandIdA: string;
  brandIdB: string;
  strength: number;
  relationType: string | null;
}

export interface NodeRelation {
  id: string;
  nodeIdA: string;
  nodeIdB: string;
  strength: number;
}

export interface BrandComment {
  id: string;
  brandId: string;
  authorId: string | null;
  authorName: string | null;
  content: string;
  createdAt: Date;
}

// Composite shapes that match Prisma `include` results consumed by routes.
export type BrandWithNode = Brand & { node: BrandNode | null };

export type BrandWithNodeKeywords = Brand & {
  node: BrandNode | null;
  keywords: BrandKeyword[];
};

export type BrandWithDetail = Brand & {
  node: BrandNode | null;
  keywords: BrandKeyword[];
  comments: BrandComment[];
};
