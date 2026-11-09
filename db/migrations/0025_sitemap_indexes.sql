-- Sitemap projections return bounded metadata, never hydrated product graphs.
CREATE INDEX products_sitemap ON products(store_id,status,id,slug,published_at);
CREATE INDEX product_images_sitemap ON product_images(product_id,position,id,url);
CREATE INDEX pages_sitemap ON pages(store_id,published,slug,updated_at);
