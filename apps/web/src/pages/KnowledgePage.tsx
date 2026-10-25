import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KnowledgeChunkItem, KnowledgeDocumentSummary, KnowledgeSearchResult, LlmStatus } from "@agri/shared";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  Layers,
  Plus,
  RefreshCcw,
  Search,
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
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("upload");
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);

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

  // Chunk Modal State
  const [inspectingDoc, setInspectingDoc] = useState<KnowledgeDocumentSummary | null>(null);
  const [inspectingChunks, setInspectingChunks] = useState<KnowledgeChunkItem[]>([]);
  const [inspectingLoading, setInspectingLoading] = useState(false);

  // RAG Search Debugger State
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<KnowledgeSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Load documents
  const loadDocuments = async () => {
    setLoading(true);
    try {
      const list = await api.listKnowledgeDocuments();
      setDocuments(list);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    api.getLlmStatus().then(setLlmStatus).catch(() => null);
  }, []);

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
      await loadDocuments();
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
      await loadDocuments();
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

  // Test RAG Search
  const handleTestSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    setSearching(true);
    try {
      const results = await api.searchKnowledge(testQuery.trim());
      setTestResults(results);
    } catch {
      setTestResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Filtered Documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesKeyword =
        !keyword ||
        doc.title.toLowerCase().includes(keyword.toLowerCase()) ||
        doc.category.toLowerCase().includes(keyword.toLowerCase()) ||
        (doc.fileName && doc.fileName.toLowerCase().includes(keyword.toLowerCase()));

      const matchesCategory =
        selectedCategoryFilter === "all" || doc.category === selectedCategoryFilter;

      return matchesKeyword && matchesCategory;
    });
  }, [documents, keyword, selectedCategoryFilter]);

  // Distinct Categories for Filter
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((doc) => set.add(doc.category));
    return Array.from(set);
  }, [documents]);

  const totalChunks = useMemo(() => {
    return documents.reduce((sum, doc) => sum + (doc._count?.chunks ?? 0), 0);
  }, [documents]);

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
            <span>文档：<strong>{documents.length}</strong> 篇</span>
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
        {/* Left Column: Upload / Create & RAG Test */}
        <div className="knowledge-left-panel">
          {canManage ? <section className="form-panel knowledge-input-card">
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
                    placeholder="例如：黄瓜霜霉病田间辨识与温湿度调控"
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
                    placeholder="例如：草莓炭疽病发病特征与隔离措施"
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
                      placeholder="例如：草莓育苗规范"
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
          </section> : (
            <section className="form-panel permission-notice">
              <AlertCircle size={20} />
              <span>普通用户可以查询和查看知识库；上传、录入和删除仅限管理员。</span>
            </section>
          )}

          {/* RAG Search Debugger */}
          <section className="form-panel rag-test-card">
            <div className="card-header">
              <div>
                <h2>即时检索验证 (RAG Debugger)</h2>
                <p className="card-subtext">输入提问，验证知识库是否能召回新入库的内容及其相似度得分。</p>
              </div>
            </div>

            <form onSubmit={handleTestSearch} className="rag-search-form">
              <div className="search-input-group">
                <input
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="输入问题测试，例如：黄瓜叶片有黄褐色多角形斑点..."
                />
                <button className="secondary-button" type="submit" disabled={searching || !testQuery.trim()}>
                  <Search size={16} />
                  {searching ? "检索中" : "测试检索"}
                </button>
              </div>
            </form>

            {testResults !== null && (
              <div className="test-results-box">
                <div className="test-results-head">
                  <span>检索召回结果 ({testResults.length} 个片段)</span>
                  {testResults.length === 0 && <small className="tag-warning">未达到可靠阈值（将触发安全拒答）</small>}
                </div>
                {testResults.length === 0 ? (
                  <p className="empty-hint">没有匹配到高于阈值的知识切片。建议检查文档是否包含该作物关键词。</p>
                ) : (
                  <div className="test-chunk-list">
                    {testResults.map((res, i) => (
                      <div className="test-chunk-card" key={res.chunkId}>
                        <div className="test-chunk-top">
                          <span className="rank-badge">#{i + 1}</span>
                          <strong>{res.documentTitle}</strong>
                          <span className="category-pill">{res.category}</span>
                          <span className="score-badge">相似度: {(res.score * 100).toFixed(1)}%</span>
                        </div>
                        <p className="test-chunk-snippet">{res.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Knowledge Document List */}
        <section className="list-panel knowledge-list-card">
          <div className="knowledge-list-header">
            <div>
              <h2>已入库文档清单 ({filteredDocuments.length})</h2>
              <p className="card-subtext">这些知识已切块编码并作为数字人回答事实依据。</p>
            </div>
            <button className="icon-button" title="刷新列表" onClick={loadDocuments} disabled={loading}>
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
                全部 ({documents.length})
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  className={`filter-chip ${selectedCategoryFilter === cat ? "active" : ""}`}
                  onClick={() => setSelectedCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="doc-list-scroll">
            {filteredDocuments.length === 0 ? (
              <div className="empty-state">
                <BookOpen size={40} />
                <p>{keyword || selectedCategoryFilter !== "all" ? "没有找到符合筛选条件的文档。" : "暂无知识文档，请先在左侧拖拽上传或录入。"}</p>
              </div>
            ) : (
              filteredDocuments.map((doc) => (
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
