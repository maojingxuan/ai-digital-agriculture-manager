import { useEffect, useState } from "react";
import type { LlmStatus, Product } from "@agri/shared";
import { Sparkles, Trash2 } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../auth/authContext";

export function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    api
      .listProducts()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    api.getLlmStatus().then(setLlmStatus).catch(() => setLlmStatus(null));
  }, []);

  async function handleModelChange(provider: "ollama" | "deepseek") {
    setSwitchingModel(true);
    setFormError("");
    try {
      setLlmStatus(await api.setLlmProvider(provider));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "切换模型失败。");
    } finally {
      setSwitchingModel(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setGenerating(true);
    setFormError("");
    try {
      const product = await api.createProduct({
        name: data.name,
        category: data.category,
        origin: data.origin,
        harvestTime: data.harvestTime,
        cultivationMethod: data.cultivationMethod,
        traceabilityInfo: data.traceabilityInfo,
      });
      setProducts((current) => [product, ...current]);
      form.reset();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "商品文案生成失败，请稍后重试。");
    } finally {
      setGenerating(false);
    }
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
          {user?.role === "admin" && llmStatus ? (
            <label>
              文案生成模型
              <select
                value={llmStatus.activeProvider}
                onChange={(event) => void handleModelChange(event.target.value as "ollama" | "deepseek")}
                disabled={switchingModel || generating}
              >
                {llmStatus.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}（{option.model}）{option.configured ? "" : " · 未配置密钥"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted">当前文案模型：{llmStatus ? `${llmStatus.provider}（${llmStatus.model}）` : "正在获取模型状态"}</p>
          )}
          {formError && <p className="message-banner error" role="alert">{formError}</p>}
          <button className="primary-button" disabled={generating}>
            <Sparkles size={18} />
            {generating ? "正在生成并保存商品..." : "AI生成商品描述并保存"}
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
