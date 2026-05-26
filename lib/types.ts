// Plain TS row interfaces mirroring the realigned wiki-schema tables (002 migration).
// The wiki schema now mirrors `public`: style_nodes = style clusters, brand_nodes =
// brands. bigint ids are converted to strings in the repositories (SQL `::text`)
// because the frontend / force-graph use string ids throughout. Field names are
// camelCase, aliased from snake_case columns in the SQL, so the JSON wire shape the
// frontend reads stays as close as possible to the pre-migration shape.

// Style cluster (was BrandNode/cluster). Mirrors wiki.style_nodes.
// `name` is aliased from name_ko so lib/cluster-labels.clusterLabel keeps working.
export interface StyleNode {
  id: string;
  code: string;
  name: string; // <- name_ko (clusterLabel expects the Korean cluster name)
  nameEn: string;
  color: string | null;
  mood: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Legacy alias kept for existing consumers (BottomPanel ClusterNode.description?).
  description: string | null; // <- always mapped from mood
}

// Brand (was Brand). Mirrors wiki.brand_nodes. `name` aliased from brand_name,
// `nodeId` from primary_style_node_id (both as strings).
export interface BrandNode {
  id: string;
  name: string; // <- brand_name
  instagramHandle: string | null;
  instagramUrl: string | null;
  thumbnailUrl: string | null;
  nodeId: string | null; // <- primary_style_node_id (as string)
  xPosition: number | null;
  yPosition: number | null;
  createdAt: Date;
  updatedAt: Date;
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

export interface StyleNodeAdjacency {
  fromId: string;
  toId: string;
  weight: number;
  source: string;
}

// One Instagram post for a brand (carousel children stored as ordered image_urls).
// Mirrors wiki.brand_instagram_posts (004 migration). Cover image = imageUrls[0].
export interface BrandInstagramPost {
  id: string;
  brandId: string;
  shortcode: string;
  postUrl: string | null;
  type: string | null;
  caption: string | null;
  imageUrls: string[];
  likesCount: number | null;
  commentsCount: number | null;
  takenAt: Date | null;
  position: number;
}

export interface BrandComment {
  id: string;
  brandId: string;
  authorId: string | null;
  authorName: string | null;
  content: string;
  createdAt: Date;
}

// Composite shapes consumed by routes (the `node` member is the brand's primary
// style cluster, matching the pre-migration `node` include).
export type BrandWithNode = BrandNode & { node: StyleNode | null };

export type BrandWithNodeKeywords = BrandNode & {
  node: StyleNode | null;
  keywords: BrandKeyword[];
};

export type BrandWithDetail = BrandNode & {
  node: StyleNode | null;
  keywords: BrandKeyword[];
  comments: BrandComment[];
};
