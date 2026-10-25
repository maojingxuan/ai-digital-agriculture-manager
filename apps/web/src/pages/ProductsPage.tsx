import { useEffect, useState } from "react";
import type { Product } from "@agri/shared";
import { Sparkles } from "lucide-react";
import { api } from "../services/api";

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    api
      .listProducts()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    const product = await api.createProduct({
      name: data.name,
      category: data.category,
      origin: data.origin,
      harvestTime: data.harvestTime,
      cultivationMethod: data.cultivationMethod,
      traceabilityInfo: data.traceabilityInfo,
    });
    setProducts((current) => [product, ...current]);
    event.currentTarget.reset();
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>特色农产品 · 供应链溯源</span>
          </div>
          <h1>农产品管理</h1>
        </div>
      </div>

      <div className="two-column">
        <form className="form-panel" onSubmit={handleSubmit}>
          <label>
            商品名称
            <input name="name" required placeholder="例如：阳光草莓" />
          </label>
          <label>
            商品品类
            <input name="category" required placeholder="例如：水果" />
          </label>
          <label>
            产地
            <input
              name="origin"
              required
              placeholder="例如：智慧农业示范基地"
            />
          </label>
          <label>
            采摘时间
            <input name="harvestTime" placeholder="例如：2026-09-07" />
          </label>
          <label>
            种植方式
            <input name="cultivationMethod" placeholder="例如：绿色设施栽培" />
          </label>
          <label>
            溯源信息
            <textarea
              name="traceabilityInfo"
              rows={4}
              placeholder="种植批次、检测信息、采摘记录..."
            />
          </label>
          <button className="primary-button">
            <Sparkles size={18} />
            AI生成商品描述
          </button>
        </form>

        <section className="list-panel">
          <h2>商品列表</h2>
          {products.length === 0 ? (
            <p className="muted">
              暂无商品，先创建一个用于数字人介绍的农产品。
            </p>
          ) : (
            products.map((product) => (
              <article className="list-item" key={product.id}>
                <strong>{product.name}</strong>
                <span>
                  {product.category} · {product.origin}
                </span>
                <p>{product.description}</p>
                <small>{product.avatarScript}</small>
              </article>
            ))
          )}
        </section>
      </div>
    </section>
  );
}
