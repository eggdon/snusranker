export type SnusType = "white" | "tobacco";

export interface Product {
  id: string;
  name: string;
  brand: string;
  type: SnusType;
  nicotine_mg: number;
  portions: number;
  price_sek: number;
  weight_g: number | null;
  flavor: string | null;
  image_url: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: Omit<Product, "id" | "created_at">;
        Update: Partial<Omit<Product, "id" | "created_at">>;
      };
    };
  };
}

export function calculateNPK(product: Product): number {
  return (product.nicotine_mg * product.portions) / product.price_sek;
}
