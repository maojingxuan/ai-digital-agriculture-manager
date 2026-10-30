import { useEffect, useId, useRef, useState } from "react";
import type { KnowledgeCategoryCount, KnowledgeChunkItem, KnowledgeDocumentSummary, LlmStatus } from "@agri/shared";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../auth/authContext";

const PRESET_CATEGORIES = [
  "病虫害知识",
  "大棚管理知识",
  "温湿度管理",
  "灌溉知识",
  "常见虫害",
  "农产品知识",
  "其他分类"
];

const PAGE_SIZE = 10;

function formatTime(isoString: string) {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  } catch {
    return isoString;
  }
}

export function KnowledgePage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<KnowledgeCategoryCount[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("upload");
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const loadSeqRef = useRef(0);
  const isFirstFilterRender = useRef(true);

  // Upload Form State
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("病虫害知识");
  const [customUploadCategory, setCustomUploadCategory] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  // Manual Form State
  const [manualTitle, setManualTitle] = useState("");
  const [manualCategory, setManualCategory] = useState("病虫害知识");
  const [customManualCategory, setCustomManualCategory] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Filter & Search State
  const [keyword, setKeyword] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");

  // Advanced Search State（高级检索：时间范围 / 来源类型 / 来源机构 / 排序）
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("all");
  const [sourceKeyword, setSourceKeyword] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const advancedActiveCount =
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (sourceTypeFilter !== "all" ? 1 : 0) +
    (sourceKeyword.trim() ? 1 : 0) +
    (sortOrder === "oldest" ? 1 : 0);

  // Chunk Modal State
  const [inspectingDoc, setInspectingDoc] = useState<KnowledgeDocumentSummary | null>(null);
  const [inspectingChunks, setInspectingChunks] = useState<KnowledgeChunkItem[]>([]);
  const [inspectingLoading, setInspectingLoading] = useState(false);

  // Load documents with server-side pagination & filtering
  const loadDocuments = async (reset = false) => {
    const seq = ++loadSeqRef.current;
    const targetPage = reset ? 1 : page + 1;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const result = await api.listKnowledgeDocuments({
        page: targetPage,
        pageSize: PAGE_SIZE,
        category: selectedCategoryFilter === "all" ? undefined : selectedCategoryFilter,
        search: keyword.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sourceType: sourceTypeFilter === "all" ? undefined : sourceTypeFilter,
        source: sourceKeyword.trim() || undefined,
        sortBy: sortOrder
      });
      if (seq !== loadSeqRef.current) return; // 丢弃过期响应，避免竞态覆盖
      setDocuments((prev) => (reset ? result.items : [...prev, ...result.items]));
      setTotal(result.total);
      setTotalChunks(result.totalChunks);
      setCategoryCounts(result.categories);
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch {
      if (seq !== loadSeqRef.current) return;
      if (reset) setDocuments([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      // 仅当响应未过期时才清理 loading 状态
      if (seq === loadSeqRef.current) {
        if (reset) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    }
  };

  useEffect(() => {
    api.getLlmStatus().then(setLlmStatus).catch(() => null);
  }, []);

  // 首次进入立即加载；关键词/分类/高级检索条件变化时防抖 300ms 后重置到第一页
  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;
      loadDocuments(true);
      return;
    }
    const timer = setTimeout(() => {
      loadDocuments(true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, selectedCategoryFilter, dateFrom, dateTo, sourceTypeFilter, sourceKeyword, sortOrder]);

  // 重置全部高级检索条件
  const resetAdvancedSearch = () => {
    setDateFrom("");
    setDateTo("");
    setSourceTypeFilter("all");
    setSourceKeyword("");
    setSortOrder("newest");
  };

  // Handle Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "md", "markdown", "csv"].includes(ext ?? "")) {
      setUploadMessage({ type: "error", text: "仅支持 .txt、.md、.markdown、.csv 格式的农业文档。" });
      return;
    }
    setSelectedFile(file);
    setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
    setUploadMessage(null);
  };

  // Submit File Upload
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadMessage({ type: "error", text: "请先拖入或选择文件。" });
      return;
    }

    const category = uploadCategory === "其他分类" ? customUploadCategory.trim() : uploadCategory;
    if (!category) {
      setUploadMessage({ type: "error", text: "请输入或选择分类。" });
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("category", category);
    if (uploadTitle.trim()) {
      formData.append("title", uploadTitle.trim());
    }

    try {
      await api.uploadKnowledgeFile(formData);
      setUploadMessage({ type: "success", text: `文档《${uploadTitle || selectedFile.name}》已成功切分并完成向量入库！` });
      setSelectedFile(null);
      setUploadTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocuments(true);
    } catch (err) {
      setUploadMessage({ type: "error", text: err instanceof Error ? err.message : "上传失败，请检查文件内容。" });
    } finally {
      setUploading(false);
    }
  };

  // Submit Manual Text
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualContent.trim()) {
      setUploadMessage({ type: "error", text: "标题和知识内容不能为空。" });
      return;
    }

    const category = manualCategory === "其他分类" ? customManualCategory.trim() : manualCategory;
    if (!category) {
      setUploadMessage({ type: "error", text: "请指定知识分类。" });
      return;
    }

    setManualSubmitting(true);
    setUploadMessage(null);

    try {
      await api.createKnowledgeDocument({
        title: manualTitle.trim(),
        category,
        content: manualContent.trim()
      });
      setUploadMessage({ type: "success", text: `知识《${manualTitle}》已成功入库！` });
      setManualTitle("");
      setManualContent("");
      await loadDocuments(true);
    } catch (err) {
      setUploadMessage({ type: "error", text: err instanceof Error ? err.message : "创建失败。" });
    } finally {
      setManualSubmitting(false);
    }
  };

  // Delete Document
  const handleDelete = async (doc: KnowledgeDocumentSummary) => {
    if (!confirm(`确定要删除《${doc.title}》吗？这将同时清理其关联的所有向量切片。`)) {
      return;
    }

    try {
      await api.deleteKnowledgeDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setTotal((t) => Math.max(0, t - 1));
      setCategoryCounts((prev) =>
        prev.map((c) =>
          c.category === doc.category ? { ...c, count: Math.max(0, c.count - 1) } : c
        )
      );
      if (inspectingDoc?.id === doc.id) {
        setInspectingDoc(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  };

  // Inspect Chunks
  const handleInspect = async (doc: KnowledgeDocumentSummary) => {
    setInspectingDoc(doc);
    setInspectingLoading(true);
    try {
      const detail = await api.getKnowledgeDocumentDetail(doc.id);
      setInspectingChunks(detail.chunks);
    } catch {
      setInspectingChunks([]);
    } finally {
      setInspectingLoading(false);
    }
  };

  // 过滤与分页均在服务端完成：documents 为已加载的当前页数据，
  // total/totalChunks/categoryCounts 为服务端返回的全量统计。

  return (
    <section className="page knowledge-page">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>农艺知识图谱 · 向量语义检索</span>
          </div>
          <h1>农业专业知识库</h1>
          <p className="subtext">
            统一维护农业植保、大棚管护、病虫害识别资料。系统自动分块切片并建立语义向量索引，供数字人 Agent 实时精准召回。
          </p>
        </div>

        <div className="stats-badges">
          <div className="stat-badge">
            <BookOpen size={16} />
            <span>文档：<strong>{total}</strong> 篇</span>
          </div>
          <div className="stat-badge">
            <Layers size={16} />
            <span>切片：<strong>{totalChunks}</strong> 个</span>
          </div>
          <div className={`stat-badge ${llmStatus?.configured ? "llm-badge-active" : ""}`}>
            <Sparkles size={16} />
            <span>
              大模型：
              <strong>
                {llmStatus?.configured
                  ? `${llmStatus.provider} (${llmStatus.model})`
                  : "本地规则引擎"}
              </strong>
            </span>
          </div>
        </div>
      </div>

      <div className="two-column knowledge-grid">
        {/* 管理员：左侧上传/录入 + 右侧文档清单；普通用户：权限提示与文档清单上下排版 */}
        {canManage ? (
          <div className="knowledge-left-panel">
            <section className="form-panel knowledge-input-card">
            <div className="knowledge-tabs">
              <button
                className={activeTab === "upload" ? "active" : ""}
                onClick={() => {
                  setActiveTab("upload");
                  setUploadMessage(null);
                }}
              >
                <UploadCloud size={16} />
                文件拖拽上传
              </button>
              <button
                className={activeTab === "manual" ? "active" : ""}
                onClick={() => {
                  setActiveTab("manual");
                  setUploadMessage(null);
                }}
              >
                <Plus size={16} />
                直接录入文本
              </button>
            </div>

            {uploadMessage && (
              <div className={`message-banner ${uploadMessage.type}`}>
                {uploadMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{uploadMessage.text}</span>
              </div>
            )}

            {activeTab === "upload" ? (
              <form onSubmit={handleFileUpload} className="upload-form">
                {/* Drag and Drop Zone */}
                <div
                  className={`dropzone ${dragActive ? "active" : ""} ${selectedFile ? "has-file" : ""}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <label htmlFor={fileInputId} className="visually-hidden">选择农业文档</label>
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    accept=".txt,.md,.markdown,.csv"
                    onChange={handleFileInputChange}
                    style={{ display: "none" }}
                  />
                  <div className="dropzone-inner">
                    <div className="dropzone-icon">
                      {selectedFile ? <FileText size={32} /> : <UploadCloud size={32} />}
                    </div>
                    {selectedFile ? (
                      <div className="file-info">
                        <strong>{selectedFile.name}</strong>
                        <span>{(selectedFile.size / 1024).toFixed(1)} KB · 点击可重新选择</span>
                      </div>
                    ) : (
                      <div className="dropzone-prompt">
                        <strong>拖拽农业文档到此处，或点击浏览选择</strong>
                        <p>支持 .txt、.md、.markdown、.csv 格式</p>
                      </div>
                    )}
                  </div>
                </div>

                <label>
                  文档标题（可选，默认使用文件名）
                  <input
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="例如：玉米大斑病田间辨识与水肥调控"
                  />
                </label>

                <label>
                  知识分类
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                  >
                    {PRESET_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                {uploadCategory === "其他分类" && (
                  <label>
                    自定义分类名称
                    <input
                      value={customUploadCategory}
                      onChange={(e) => setCustomUploadCategory(e.target.value)}
                      placeholder="例如：水肥一体化配方"
                      required
                    />
                  </label>
                )}

                <button className="primary-button" type="submit" disabled={uploading || !selectedFile}>
                  <UploadCloud size={18} />
                  {uploading ? "正在解析与切片入库..." : "开始自动切分并入库"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleManualSubmit} className="manual-form">
                <label>
                  知识标题
                  <input
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    required
                    placeholder="例如：玉米小斑病发病特征与隔离措施"
                  />
                </label>

                <label>
                  知识分类
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                  >
                    {PRESET_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                {manualCategory === "其他分类" && (
                  <label>
                    自定义分类名称
                    <input
                      value={customManualCategory}
                      onChange={(e) => setCustomManualCategory(e.target.value)}
                      placeholder="例如：玉米育苗规范"
                      required
                    />
                  </label>
                )}

                <label>
                  知识详细内容（系统将依据标点与段落自动切片）
                  <textarea
                    rows={8}
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    required
                    placeholder="粘贴具体的农艺方案、病症表现、检查点、通风浇水建议等专业内容..."
                  />
                </label>

                <button className="primary-button" type="submit" disabled={manualSubmitting}>
                  <Plus size={18} />
                  {manualSubmitting ? "切分保存中..." : "保存并向量化"}
                </button>
              </form>
            )}
          </section>
          </div>
        ) : (
          <section className="form-panel permission-notice knowledge-permission-full">
            <AlertCircle size={20} />
            <span>普通用户可以查询和查看知识库；上传、录入和删除仅限管理员。</span>
          </section>
        )}

        {/* Right Column: Knowledge Document List */}
        <section className={`list-panel knowledge-list-card ${canManage ? "" : "knowledge-list-full"}`}>
          <div className="knowledge-list-header">
            <div>
              <h2>已入库文档清单 ({total})</h2>
              <p className="card-subtext">这些知识已切块编码并作为数字人回答事实依据。</p>
            </div>
            <button className="icon-button" title="刷新列表" onClick={() => loadDocuments(true)} disabled={loading}>
              <RefreshCcw size={16} className={loading ? "spin" : ""} />
            </button>
          </div>

          <div className="knowledge-filter-bar">
            <div className="search-bar">
              <Search size={16} />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索文档名称、分类或文件名..."
              />
              {keyword && (
                <button className="clear-btn" onClick={() => setKeyword("")}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="category-filter-chips">
              <button
                className={`filter-chip ${selectedCategoryFilter === "all" ? "active" : ""}`}
                onClick={() => setSelectedCategoryFilter("all")}
              >
                全部 ({total})
              </button>
              {categoryCounts.map((c) => (
                <button
                  key={c.category}
                  className={`filter-chip ${selectedCategoryFilter === c.category ? "active" : ""}`}
                  onClick={() => setSelectedCategoryFilter(c.category)}
                >
                  {c.category} ({c.count})
                </button>
              ))}
            </div>

            {/* 高级检索：时间日期 / 知识库来源 / 排序 */}
            <div className="advanced-search-toggle">
              <button
                className={`advanced-toggle-btn ${showAdvanced || advancedActiveCount > 0 ? "active" : ""}`}
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
              >
                <SlidersHorizontal size={14} />
                高级检索
                {advancedActiveCount > 0 && (
                  <span className="filter-count-badge">{advancedActiveCount}</span>
                )}
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {showAdvanced && (
              <div className="advanced-search-panel">
                <div className="adv-search-row">
                  <label htmlFor="adv-date-from">入库时间</label>
                  <div className="adv-date-range">
                    <input
                      id="adv-date-from"
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <span>至</span>
                    <input
                      id="adv-date-to"
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>

                <div className="adv-search-row">
                  <label htmlFor="adv-source-type">来源类型</label>
                  <select
                    id="adv-source-type"
                    value={sourceTypeFilter}
                    onChange={(e) => setSourceTypeFilter(e.target.value)}
                  >
                    <option value="all">全部来源</option>
                    <option value="manual">手动录入</option>
                    <option value="upload">文件上传</option>
                    <option value="seed">系统预置</option>
                  </select>
                </div>

                <div className="adv-search-row">
                  <label htmlFor="adv-source-org">来源机构</label>
                  <input
                    id="adv-source-org"
                    type="text"
                    value={sourceKeyword}
                    onChange={(e) => setSourceKeyword(e.target.value)}
                    placeholder="如：农业农村部、全国农技中心（匹配文档标注的来源）"
                  />
                </div>

                <div className="adv-search-row">
                  <label htmlFor="adv-sort">排序方式</label>
                  <select
                    id="adv-sort"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  >
                    <option value="newest">最新入库优先</option>
                    <option value="oldest">最早入库优先</option>
                  </select>
                </div>

                <div className="adv-search-actions">
                  <button
                    type="button"
                    className="secondary-button adv-reset-btn"
                    onClick={resetAdvancedSearch}
                    disabled={advancedActiveCount === 0}
                  >
                    重置高级条件
                  </button>
                  <span className="adv-hint">条件变更后自动刷新列表</span>
                </div>
              </div>
            )}
          </div>

          <div className="doc-list-scroll">
            {loading ? (
              <div className="empty-state">
                <RefreshCcw size={32} className="spin" />
                <p>正在加载文档清单...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <BookOpen size={40} />
                <p>{keyword || selectedCategoryFilter !== "all" || advancedActiveCount > 0 ? "没有找到符合筛选条件的文档，请调整关键词或高级检索条件。" : "暂无知识文档，请先在左侧拖拽上传或录入。"}</p>
              </div>
            ) : (
              documents.map((doc) => (
                <article className="knowledge-doc-card" key={doc.id}>
                  <div className="doc-card-main">
                    <div className="doc-card-badges">
                      <span className="category-pill">{doc.category}</span>
                      <span className={`source-pill ${doc.sourceType}`}>
                        {doc.sourceType === "upload" ? "文件上传" : doc.sourceType === "seed" ? "预置种子" : "手动录入"}
                      </span>
                      <span className="chunks-pill">{doc._count?.chunks ?? 0} 个切片</span>
                    </div>

                    <h3 className="doc-title">{doc.title}</h3>

                    {doc.fileName && (
                      <div className="doc-filename">
                        <FileText size={14} />
                        <span>{doc.fileName}</span>
                      </div>
                    )}

                    <div className="doc-meta">
                      <span>添加时间：{formatTime(doc.createdAt)}</span>
                    </div>
                  </div>

                  <div className="doc-actions">
                    <button
                      className="secondary-button view-chunk-btn"
                      onClick={() => handleInspect(doc)}
                      title="查看系统如何切分该文档"
                    >
                      <Layers size={14} />
                      查看切片
                    </button>
                    {canManage && (
                      <button
                        className="danger-icon-button"
                        onClick={() => handleDelete(doc)}
                        title="删除此文档及向量切片"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>

          {!loading && documents.length > 0 && (
            <div className="doc-pagination-bar">
              <span className="doc-pagination-info">
                已加载 {documents.length} / {total} 篇
              </span>
              {hasMore && (
                <button
                  className="secondary-button"
                  onClick={() => loadDocuments(false)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "加载中..." : "加载更多"}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Chunks Inspection Modal */}
      {inspectingDoc && (
        <div className="modal-overlay" onClick={() => setInspectingDoc(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="context-tag">分块切片索引预览</span>
                <h2>《{inspectingDoc.title}》切片详情</h2>
                <p className="modal-subtext">
                  共拆分为 {inspectingChunks.length} 个语义片段，每个切片均已计算独立向量以供快速召回。
                </p>
              </div>
              <button className="icon-button close-btn" onClick={() => setInspectingDoc(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {inspectingLoading ? (
                <p className="muted">正在加载切片数据...</p>
              ) : inspectingChunks.length === 0 ? (
                <p className="muted">该文档暂无切片数据。</p>
              ) : (
                <div className="chunks-list">
                  {inspectingChunks.map((chunk) => (
                    <div className="chunk-inspect-card" key={chunk.id}>
                      <div className="chunk-inspect-top">
                        <span className="chunk-index-tag">切片 #{chunk.chunkIndex + 1}</span>
                        <span className="token-tag">估算 Tokens: {chunk.tokenCount}</span>
                      </div>
                      <p className="chunk-inspect-content">{chunk.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
