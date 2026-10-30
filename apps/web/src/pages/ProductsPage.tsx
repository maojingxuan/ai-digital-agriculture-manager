import { useEffect, useState } from "react";
import type { Product } from "@agri/shared";
import { Sparkles, Trash2 } from "lucide-react";
import { api } from "../services/api";

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      if (current.size === products.length) return new Set();
      return new Set(products.map((product) => product.id));
    });
  }

  async function handleDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) {
      window.alert("请先在列表中勾选要删除的商品。");
      return;
    }
    if (!window.confirm(`确定删除选中的 ${ids.length} 个商品吗？`)) return;
    await api.deleteProducts(ids);
    setProducts((current) => current.filter((product) => !selected.has(product.id)));
    setSelected(new Set());
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
            <input name="name" required placeholder="例如：鲜食玉米" />
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
          <div className="list-head">
            <h2>商品列表</h2>
            {products.length > 0 && (
              <div className="list-toolbar">
                <label className="select-all">
                  <input
                    type="checkbox"
                    checked={selected.size === products.length}
                    onChange={toggleAll}
                  />
                  全选
                </label>
                <button
                  className="danger-button"
                  onClick={handleDeleteSelected}
                >
                  <Trash2 size={15} />
                  删除所选{selected.size > 0 ? `（${selected.size}）` : ""}
                </button>
              </div>
            )}
          </div>
          {products.length === 0 ? (
            <p className="muted">
              暂无商品，先创建一个用于数字人介绍的农产品。
            </p>
          ) : (
            products.map((product) => (
              <article
                className={`list-item ${selected.has(product.id) ? "is-selected" : ""}`}
                key={product.id}
              >
                <label className="list-check">
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggle(product.id)}
                    aria-label={`选择 ${product.name}`}
                  />
                </label>
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
