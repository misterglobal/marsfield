"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/app/layout";

type Influencer = {
  id: string;
  name: string;
  profile: any;
  voiceProfile?: string;
  status: string;
  currentVersion: number;
  versions?: Array<{ imageUrl?: string }>;
};
type Product = {
  id: string;
  name: string;
  brandName?: string;
  description?: string;
  primaryStorageObjectId?: string;
};
type Scene = {
  id: string;
  index: number;
  title: string;
  durationSeconds: number;
  location: string;
  description: string;
  characterAction: string;
  expression?: string;
  wardrobe: string;
  cameraFraming: string;
  cameraMovement: string;
  lighting?: string;
  productVisible: boolean;
  dialogue?: string;
  voiceover?: string;
  onScreenText?: string;
  transition?: string;
};
type Storyboard = {
  id: string;
  version: number;
  scenesRevision: number;
  imageUrl: string;
  layout: string;
  visualStyle: string;
  prompt: string;
  approved: boolean;
  createdAt: string;
};
type VideoGeneration = {
  id: string;
  storyboardId: string;
  attempt: number;
  prompt: string;
  motionInstructions?: string;
  settings: any;
  videoUrl: string;
  approved: boolean;
  creditsUsed: number;
  createdAt: string;
};
type Project = {
  id: string;
  title: string;
  idea: string;
  status: string;
  durationSeconds: number;
  aspectRatio: string;
  scenesRevision?: number;
  influencerId: string;
  productId?: string;
  scenes?: Scene[];
  storyboards?: Storyboard[];
  videoGenerations?: VideoGeneration[];
  influencer?: Influencer;
  product?: Product;
  _count?: { scenes: number };
};
type GeneratedImage = {
  id: string;
  status: string;
  output_url?: string;
  error?: string;
};
type LibraryImage = {
  id: string;
  storageObjectId: string;
  url: string;
  thumbnailUrl?: string | null;
  type: string;
};
type Tab = "influencers" | "products" | "projects";

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  color: "var(--foreground-muted)",
  fontSize: "0.78rem",
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "0.8rem",
};

export default function InfluencerStudioPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("influencers");
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [imageOwner, setImageOwner] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [nextInfluencers, nextProducts, nextProjects, nextAssets] =
        await Promise.all([
          api.getInfluencers(),
          api.getInfluencerProducts(),
          api.getInfluencerProjects(),
          api.getAssets(),
        ]);
      setInfluencers(nextInfluencers);
      setProducts(nextProducts);
      setProjects(nextProjects);
      setLibraryImages(
        nextAssets.filter(
          (asset: LibraryImage) =>
            asset.type === "image" && asset.storageObjectId,
        ),
      );
    } catch (err: any) {
      setError(err.message || "Failed loading influencer studio");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshProject = async (id: string) => {
    const project = await api.getInfluencerProject(id);
    setSelectedProject(project);
    await load();
    return project;
  };

  const generateInfluencer = async (
    influencer: Influencer,
    variations: number,
  ) => {
    setError("");
    setGeneratingFor(influencer.id);
    setImageOwner(influencer.id);
    setImages([]);
    try {
      const prepared = await api.getInfluencerGenerationPrompt(influencer.id);
      const result = await api.generate({
        workflow: "text-to-image",
        model: "google/nano-banana-2",
        prompt: prepared.prompt,
        params: {
          aspect_ratio: "3:4",
          resolution: "1K",
          output_format: "jpg",
          variations,
          reference_image_ids: prepared.reference_storage_ids,
        },
      });
      const pending: GeneratedImage[] = result.predictions || [
        { id: result.id, status: result.status, output_url: result.output_url },
      ];
      setImages(pending);
      const complete = await Promise.all(
        pending.map(async (item) => {
          let current = item;
          for (
            let attempt = 0;
            attempt < 90 &&
            !["succeeded", "failed", "canceled"].includes(current.status);
            attempt += 1
          ) {
            await new Promise((resolve) => window.setTimeout(resolve, 2500));
            current = await api.getPrediction(item.id);
            setImages((existing) =>
              existing.map((image) => (image.id === item.id ? current : image)),
            );
          }
          return current;
        }),
      );
      setImages(complete);
    } catch (err: any) {
      setError(err.message || "Influencer generation failed");
    } finally {
      setGeneratingFor(null);
    }
  };

  const approveImage = async (influencerId: string, predictionId: string) => {
    setBusy("approve-image");
    setError("");
    try {
      await api.approveInfluencer(influencerId, predictionId);
      setImages([]);
      setImageOwner(null);
      await load();
    } catch (err: any) {
      setError(err.message || "Failed approving influencer");
    } finally {
      setBusy("");
    }
  };

  if (!token)
    return (
      <div
        className="glass-card"
        style={{ padding: "4rem", textAlign: "center" }}
      >
        Sign in to create AI influencers.
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <section
        className="glass-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="badge badge-purple">Guided workflow</span>
          <h1 style={{ margin: "0.55rem 0 0.35rem" }}>AI Influencer Studio</h1>
          <p style={{ margin: 0, color: "var(--foreground-muted)" }}>
            Create an original or creator-referenced influencer, plan every
            scene, then direct one consistent Kling V3 video.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(["influencers", "products", "projects"] as Tab[]).map((item) => (
            <button
              key={item}
              className={`btn ${tab === item ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </section>
      {error && (
        <div
          style={{
            padding: "0.8rem",
            color: "#f87171",
            border: "1px solid rgba(248,113,113,.35)",
            borderRadius: 10,
          }}
        >
          {error}
        </div>
      )}
      {tab === "influencers" && (
        <InfluencersPanel
          influencers={influencers}
          libraryImages={libraryImages}
          images={images}
          imageOwner={imageOwner}
          generatingFor={generatingFor}
          busy={busy}
          onCreated={load}
          onGenerate={generateInfluencer}
          onApprove={approveImage}
          setError={setError}
        />
      )}
      {tab === "products" && (
        <ProductsPanel
          products={products}
          onCreated={load}
          setError={setError}
        />
      )}
      {tab === "projects" && (
        <ProjectsPanel
          projects={projects}
          influencers={influencers}
          products={products}
          selected={selectedProject}
          setSelected={setSelectedProject}
          refresh={refreshProject}
          onCreated={load}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
        />
      )}
    </div>
  );
}

function InfluencersPanel({
  influencers,
  libraryImages,
  images,
  imageOwner,
  generatingFor,
  busy,
  onCreated,
  onGenerate,
  onApprove,
  setError,
}: any) {
  const [form, setForm] = useState({
    name: "",
    age: 25,
    gender: "woman",
    niche: "lifestyle",
    personality: "warm, confident and energetic",
    appearance: "",
    wardrobe: "modern casual",
    visual: "premium photorealistic UGC",
    voice: "warm, conversational Canadian English",
  });
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [libraryReferenceIds, setLibraryReferenceIds] = useState<string[]>([]);
  const [referenceConsent, setReferenceConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const referenceCount = referenceFiles.length + libraryReferenceIds.length;
  const toggleLibraryReference = (storageId: string) =>
    setLibraryReferenceIds((current) =>
      current.includes(storageId)
        ? current.filter((id) => id !== storageId)
        : current.length + referenceFiles.length < 4
          ? [...current, storageId]
          : current,
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setUploading(true);
    setError("");
    try {
      const uploads = [];
      for (const file of referenceFiles.slice(
        0,
        4 - libraryReferenceIds.length,
      ))
        uploads.push(
          await api.uploadFile(file, "influencer-identity-reference"),
        );
      const referenceIds = [
        ...libraryReferenceIds,
        ...uploads.map((item) => item.id),
      ];
      await api.createInfluencer({
        name: form.name,
        voice_profile: form.voice,
        reference_storage_ids: referenceIds,
        reference_consent: referenceIds.length ? referenceConsent : false,
        profile: {
          age: Number(form.age),
          gender_presentation: form.gender,
          content_niche: form.niche,
          personality: form.personality,
          appearance: form.appearance,
          default_wardrobe: form.wardrobe,
          visual_style: form.visual,
        },
      });
      setForm({ ...form, name: "", appearance: "" });
      setReferenceFiles([]);
      setLibraryReferenceIds([]);
      setReferenceConsent(false);
      await onCreated();
    } catch (err: any) {
      setError(err.message || "Failed creating influencer");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div
      className="influencer-split"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 380px) 1fr",
        gap: "1.25rem",
      }}
    >
      <form
        className="glass-card"
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}
      >
        <h2 style={{ margin: 0 }}>Create influencer</h2>
        <p
          style={{
            margin: 0,
            color: "var(--foreground-muted)",
            fontSize: ".82rem",
          }}
        >
          Create an original adult identity or guide it with photos you have
          permission to use.
        </p>
        <label style={field}>
          Name
          <input
            className="form-input"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <div style={grid}>
          <label style={field}>
            Age
            <input
              className="form-input"
              type="number"
              min={18}
              max={80}
              value={form.age}
              onChange={(e) =>
                setForm({ ...form, age: Number(e.target.value) })
              }
            />
          </label>
          <label style={field}>
            Gender presentation
            <input
              className="form-input"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            />
          </label>
        </div>
        <label style={field}>
          Content niche
          <input
            className="form-input"
            value={form.niche}
            onChange={(e) => setForm({ ...form, niche: e.target.value })}
          />
        </label>
        <label style={field}>
          Personality
          <input
            className="form-input"
            value={form.personality}
            onChange={(e) => setForm({ ...form, personality: e.target.value })}
          />
        </label>
        <label style={field}>
          Appearance
          <textarea
            className="form-textarea"
            required
            rows={4}
            placeholder="Face, complexion, hair, build, distinguishing features..."
            value={form.appearance}
            onChange={(e) => setForm({ ...form, appearance: e.target.value })}
          />
        </label>
        <label style={field}>
          Default wardrobe
          <input
            className="form-input"
            value={form.wardrobe}
            onChange={(e) => setForm({ ...form, wardrobe: e.target.value })}
          />
        </label>
        <label style={field}>
          Visual style
          <input
            className="form-input"
            value={form.visual}
            onChange={(e) => setForm({ ...form, visual: e.target.value })}
          />
        </label>
        <label style={field}>
          Voice profile
          <input
            className="form-input"
            value={form.voice}
            onChange={(e) => setForm({ ...form, voice: e.target.value })}
          />
        </label>
        <div>
          <strong style={{ fontSize: ".85rem" }}>
            Choose from your library
          </strong>
          <p
            style={{
              margin: ".2rem 0 .65rem",
              color: "var(--foreground-muted)",
              fontSize: ".75rem",
            }}
          >
            Select image assets as identity references. Library selections and
            uploads share a four-image limit.
          </p>
          <div className="asset-picker-grid">
            {libraryImages.map((asset: LibraryImage) => {
              const selected = libraryReferenceIds.includes(
                asset.storageObjectId,
              );
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-label={`Influencer reference ${asset.id}`}
                  className={`asset-picker-card ${selected ? "selected" : ""}`}
                  onClick={() => toggleLibraryReference(asset.storageObjectId)}
                  disabled={!selected && referenceCount >= 4}
                >
                  <img
                    src={asset.thumbnailUrl || asset.url}
                    alt=""
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                  />
                  <small>{selected ? "Selected" : "Image"}</small>
                </button>
              );
            })}
            {!libraryImages.length && (
              <span
                style={{ color: "var(--foreground-muted)", fontSize: ".8rem" }}
              >
                No durable image assets are in your library yet.
              </span>
            )}
          </div>
        </div>
        <label style={field}>
          Or upload reference images ({referenceCount}/4 selected)
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={libraryReferenceIds.length >= 4}
            onChange={(e) =>
              setReferenceFiles(
                Array.from(e.target.files || []).slice(
                  0,
                  4 - libraryReferenceIds.length,
                ),
              )
            }
          />
        </label>
        {referenceCount > 0 && (
          <label
            style={{ ...field, flexDirection: "row", alignItems: "flex-start" }}
          >
            <input
              type="checkbox"
              checked={referenceConsent}
              onChange={(e) => setReferenceConsent(e.target.checked)}
            />
            <span>
              I confirm every depicted person is 18+, I have permission to use
              these images, and I will not use them for deceptive impersonation.
            </span>
          </label>
        )}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={uploading || (referenceCount > 0 && !referenceConsent)}
        >
          {uploading ? "Uploading references…" : "Save draft"}
        </button>
      </form>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {influencers.map((item: Influencer) => (
          <article key={item.id} className="glass-card">
            <div style={{ display: "flex", gap: "1rem" }}>
              {item.versions?.[0]?.imageUrl && (
                <img
                  src={item.versions[0].imageUrl}
                  alt={item.name}
                  style={{
                    width: 110,
                    height: 140,
                    objectFit: "cover",
                    borderRadius: 12,
                  }}
                />
              )}
              <div style={{ flex: 1 }}>
                <span className="badge badge-purple">{item.status}</span>
                <h3>{item.name}</h3>
                <p
                  style={{
                    color: "var(--foreground-muted)",
                    fontSize: ".85rem",
                  }}
                >
                  {item.profile?.content_niche} · age {item.profile?.age} ·
                  version {item.currentVersion}
                </p>
                <div
                  style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}
                >
                  <button
                    className="btn btn-primary"
                    disabled={generatingFor === item.id}
                    onClick={() => onGenerate(item, 1)}
                  >
                    Generate primary · 1 credit
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={generatingFor === item.id}
                    onClick={() => onGenerate(item, 4)}
                  >
                    4 variations · 4 credits
                  </button>
                </div>
              </div>
            </div>
            {generatingFor === item.id && (
              <p style={{ color: "var(--foreground-muted)" }}>
                Generating portraits…
              </p>
            )}
            {images.length > 0 && imageOwner === item.id && (
              <div style={{ ...grid, marginTop: "1rem" }}>
                {images.map((image: GeneratedImage) => (
                  <div key={image.id}>
                    {image.output_url ? (
                      <img
                        src={image.output_url}
                        alt="Generated influencer option"
                        style={{
                          width: "100%",
                          aspectRatio: "3/4",
                          objectFit: "cover",
                          borderRadius: 12,
                        }}
                      />
                    ) : (
                      <div style={{ padding: "2rem" }}>{image.status}</div>
                    )}
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", marginTop: ".4rem" }}
                      disabled={image.status !== "succeeded" || busy}
                      onClick={() => onApprove(item.id, image.id)}
                    >
                      Use this appearance
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
        {influencers.length === 0 && (
          <div className="glass-card">
            No influencers yet. Create your first fictional creator.
          </div>
        )}
      </div>
    </div>
  );
}

function ProductsPanel(props: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <ProductUrlScanner {...props} />
      <LegacyProductsPanel {...props} />
    </div>
  );
}

function ProductUrlScanner({ onCreated, setError }: any) {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scan, setScan] = useState<any>(null);
  const run = async () => {
    setScanning(true);
    setError("");
    try {
      setScan(await api.scanInfluencerProductUrl(url));
    } catch (err: any) {
      setError(err.message || "Failed scanning product URL");
    } finally {
      setScanning(false);
    }
  };
  const save = async () => {
    if (!scan) return;
    setSaving(true);
    setError("");
    try {
      await api.createInfluencerProduct({
        name: scan.name,
        brand_name: scan.brand_name,
        description: scan.description,
        approved_claims: scan.detected_claims,
        restricted_claims: scan.restrictions_to_review,
        brand_colours: scan.brand_colours,
        source_url: scan.source_url,
        source_data: scan,
        external_image_urls: scan.image_urls,
        reference_storage_ids: [],
      });
      setScan(null);
      setUrl("");
      await onCreated();
    } catch (err: any) {
      setError(err.message || "Failed saving scanned product");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className="glass-card"
      style={{ display: "flex", flexDirection: "column", gap: ".8rem" }}
    >
      <div>
        <span className="badge badge-purple">URL scanner</span>
        <h2>Import a product page</h2>
        <p style={{ color: "var(--foreground-muted)", marginBottom: 0 }}>
          Pull structured product data from a public HTTPS page. Review all
          extracted claims before saving.
        </p>
      </div>
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <input
          className="form-input"
          type="url"
          placeholder="https://brand.example/products/product-name"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          style={{ flex: "1 1 320px" }}
        />
        <button
          className="btn btn-primary"
          disabled={scanning || !url.trim()}
          onClick={run}
        >
          {scanning ? "Scanning…" : "Scan product URL"}
        </button>
      </div>
      {scan && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: ".75rem",
            borderTop: "1px solid var(--panel-border)",
            paddingTop: ".9rem",
          }}
        >
          <div style={grid}>
            <label style={field}>
              Product name
              <input
                className="form-input"
                value={scan.name}
                onChange={(e) => setScan({ ...scan, name: e.target.value })}
              />
            </label>
            <label style={field}>
              Brand
              <input
                className="form-input"
                value={scan.brand_name}
                onChange={(e) =>
                  setScan({ ...scan, brand_name: e.target.value })
                }
              />
            </label>
            <label style={field}>
              Category
              <input
                className="form-input"
                value={scan.category}
                onChange={(e) => setScan({ ...scan, category: e.target.value })}
              />
            </label>
          </div>
          <label style={field}>
            Description
            <textarea
              className="form-textarea"
              rows={4}
              value={scan.description}
              onChange={(e) =>
                setScan({ ...scan, description: e.target.value })
              }
            />
          </label>
          <label style={field}>
            Detected claims requiring approval
            <textarea
              className="form-textarea"
              rows={4}
              value={(scan.detected_claims || []).join("\n")}
              onChange={(e) =>
                setScan({
                  ...scan,
                  detected_claims: e.target.value.split("\n").filter(Boolean),
                })
              }
            />
          </label>
          <label style={field}>
            Restrictions to review
            <textarea
              className="form-textarea"
              rows={3}
              value={(scan.restrictions_to_review || []).join("\n")}
              onChange={(e) =>
                setScan({
                  ...scan,
                  restrictions_to_review: e.target.value
                    .split("\n")
                    .filter(Boolean),
                })
              }
            />
          </label>
          {scan.image_urls?.length > 0 && (
            <div>
              <strong>Source images</strong>
              <p
                style={{ color: "var(--foreground-muted)", fontSize: ".75rem" }}
              >
                Preview only. Upload approved originals below to use them as
                durable generation references.
              </p>
              <div style={grid}>
                {scan.image_urls.map((imageUrl: string) => (
                  <img
                    key={imageUrl}
                    src={imageUrl}
                    alt="Scanned product"
                    referrerPolicy="no-referrer"
                    style={{
                      width: "100%",
                      maxHeight: 220,
                      objectFit: "contain",
                      borderRadius: 10,
                      background: "#fff",
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <button
            className="btn btn-primary"
            disabled={saving || !scan.name?.trim()}
            onClick={save}
          >
            {saving ? "Saving…" : "Save reviewed product"}
          </button>
        </div>
      )}
    </section>
  );
}

function LegacyProductsPanel({ products, onCreated, setError }: any) {
  const [form, setForm] = useState({
    name: "",
    brand: "",
    description: "",
    approved: "",
    restricted: "",
    colours: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setUploading(true);
    try {
      const uploads = [];
      for (const file of files.slice(0, 8))
        uploads.push(
          await api.uploadFile(file, "influencer-product-reference"),
        );
      await api.createInfluencerProduct({
        name: form.name,
        brand_name: form.brand,
        description: form.description,
        approved_claims: form.approved.split("\n"),
        restricted_claims: form.restricted.split("\n"),
        brand_colours: form.colours.split(",").map((x) => x.trim()),
        reference_storage_ids: uploads.map((x) => x.id),
      });
      setForm({
        name: "",
        brand: "",
        description: "",
        approved: "",
        restricted: "",
        colours: "",
      });
      setFiles([]);
      await onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 400px) 1fr",
        gap: "1.25rem",
      }}
    >
      <form
        className="glass-card"
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: ".8rem" }}
      >
        <h2 style={{ margin: 0 }}>Add product</h2>
        <label style={field}>
          Product name
          <input
            required
            className="form-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label style={field}>
          Brand
          <input
            className="form-input"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
        </label>
        <label style={field}>
          Description
          <textarea
            className="form-textarea"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label style={field}>
          Approved claims, one per line
          <textarea
            className="form-textarea"
            rows={3}
            value={form.approved}
            onChange={(e) => setForm({ ...form, approved: e.target.value })}
          />
        </label>
        <label style={field}>
          Restricted claims, one per line
          <textarea
            className="form-textarea"
            rows={3}
            value={form.restricted}
            onChange={(e) => setForm({ ...form, restricted: e.target.value })}
          />
        </label>
        <label style={field}>
          Brand colours
          <input
            className="form-input"
            value={form.colours}
            onChange={(e) => setForm({ ...form, colours: e.target.value })}
          />
        </label>
        <label style={field}>
          Reference images
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </label>
        <button className="btn btn-primary" disabled={uploading}>
          {uploading ? "Uploading…" : "Save product"}
        </button>
      </form>
      <div style={grid}>
        {products.map((product: Product) => (
          <article className="glass-card" key={product.id}>
            <span className="badge badge-purple">Product</span>
            <h3>{product.name}</h3>
            <p>{product.brandName || "Independent brand"}</p>
            <p style={{ color: "var(--foreground-muted)" }}>
              {product.description}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProjectsPanel({
  projects,
  influencers,
  products,
  selected,
  setSelected,
  refresh,
  onCreated,
  busy,
  setBusy,
  setError,
}: any) {
  const restoredProject = useRef(false);
  const approved = influencers.filter(
    (item: Influencer) => item.status === "approved",
  );
  const [form, setForm] = useState({
    title: "",
    idea: "",
    influencer: "",
    product: "",
    duration: 15,
    aspect: "9:16",
    platform: "TikTok",
    format: "UGC advertisement",
    objective: "Drive consideration",
    audience: "",
    cta: "",
    dialogue: "Natural dialogue and voiceover",
  });
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await api.createInfluencerProject({
        title: form.title,
        idea: form.idea,
        influencer_id: form.influencer,
        product_id: form.product || undefined,
        duration_seconds: Number(form.duration),
        aspect_ratio: form.aspect,
        brief: {
          target_platform: form.platform,
          content_format: form.format,
          objective: form.objective,
          target_audience: form.audience,
          call_to_action: form.cta,
          dialogue_preference: form.dialogue,
        },
      });
      await onCreated();
      setSelected(await api.getInfluencerProject(created.id));
      window.localStorage.setItem("marsfield-last-project", created.id);
    } catch (err: any) {
      setError(err.message);
    }
  };
  const open = async (id: string) => {
    try {
      setSelected(await api.getInfluencerProject(id));
      window.localStorage.setItem("marsfield-last-project", id);
    } catch (err: any) {
      setError(err.message);
    }
  };
  useEffect(() => {
    if (restoredProject.current || selected || !projects.length) return;
    restoredProject.current = true;
    const lastProject = window.localStorage.getItem("marsfield-last-project");
    if (lastProject && projects.some((item: Project) => item.id === lastProject)) {
      void open(lastProject);
    }
  }, [projects, selected]);
  const plan = async () => {
    if (!selected) return;
    setBusy("plan");
    try {
      setSelected(await api.planInfluencerProject(selected.id));
      await onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="influencer-projects-layout">
      <aside className="project-picker">
        <form
          className="glass-card"
          onSubmit={create}
          style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}
        >
          <h2 style={{ margin: 0 }}>New video project</h2>
          <label style={field}>
            Title
            <input
              required
              className="form-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label style={field}>
            Influencer
            <select
              required
              className="form-select"
              value={form.influencer}
              onChange={(e) => setForm({ ...form, influencer: e.target.value })}
            >
              <option value="">Choose approved influencer</option>
              {approved.map((item: Influencer) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label style={field}>
            Product
            <select
              className="form-select"
              value={form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })}
            >
              <option value="">No product</option>
              {products.map((item: Product) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label style={field}>
            Video idea
            <textarea
              required
              className="form-textarea"
              rows={5}
              value={form.idea}
              onChange={(e) => setForm({ ...form, idea: e.target.value })}
            />
          </label>
          <div style={grid}>
            <label style={field}>
              Duration
              <select
                className="form-select"
                value={form.duration}
                onChange={(e) =>
                  setForm({ ...form, duration: Number(e.target.value) })
                }
              >
                <option value={5}>5 sec</option>
                <option value={10}>10 sec</option>
                <option value={15}>15 sec</option>
              </select>
            </label>
            <label style={field}>
              Frame
              <select
                className="form-select"
                value={form.aspect}
                onChange={(e) => setForm({ ...form, aspect: e.target.value })}
              >
                <option>9:16</option>
                <option>16:9</option>
                <option>1:1</option>
              </select>
            </label>
          </div>
          <label style={field}>
            Platform
            <input
              className="form-input"
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
            />
          </label>
          <label style={field}>
            Format
            <input
              className="form-input"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
            />
          </label>
          <label style={field}>
            Audience
            <input
              className="form-input"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            />
          </label>
          <label style={field}>
            Call to action
            <input
              className="form-input"
              value={form.cta}
              onChange={(e) => setForm({ ...form, cta: e.target.value })}
            />
          </label>
          <button className="btn btn-primary" disabled={!approved.length}>
            Create project
          </button>
        </form>
        <div className="glass-card">
          <h3>Projects</h3>
          {projects.map((item: Project) => (
            <button
              key={item.id}
              className={`btn ${selected?.id === item.id ? "btn-primary" : "btn-secondary"}`}
              style={{
                width: "100%",
                marginBottom: ".5rem",
                textAlign: "left",
              }}
              onClick={() => open(item.id)}
            >
              {item.title}
              <small style={{ display: "block" }}>
                {item.status} · {item._count?.scenes || 0} scenes
              </small>
            </button>
          ))}
        </div>
      </aside>
      <main>
        {selected ? (
          <CreativeWorkspace
            project={selected}
            setProject={setSelected}
            refresh={refresh}
            plan={plan}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        ) : (
          <div
            className="glass-card"
            style={{ padding: "4rem", textAlign: "center" }}
          >
            Create or select an influencer video project.
          </div>
        )}
      </main>
    </div>
  );
}

const WORKFLOW_STEPS = [
  "Idea",
  "Character",
  "Scenes",
  "Storyboard",
  "Video",
  "Review",
] as const;
type WorkflowStep = (typeof WORKFLOW_STEPS)[number];
type SceneTab = "Visual" | "Action" | "Camera" | "Dialogue" | "Transition";

function CreativeWorkspace({
  project,
  setProject,
  refresh,
  plan,
  busy,
  setBusy,
  setError,
}: any) {
  const savedStep =
    typeof window !== "undefined"
      ? (window.localStorage.getItem(
          `marsfield-step-${project.id}`,
        ) as WorkflowStep)
      : null;
  const [step, setStep] = useState<WorkflowStep>(
    savedStep && WORKFLOW_STEPS.includes(savedStep)
      ? savedStep
      : project.scenes?.length
        ? "Scenes"
        : "Idea",
  );
  const [sceneId, setSceneId] = useState(project.scenes?.[0]?.id || "");
  const [sceneTab, setSceneTab] = useState<SceneTab>("Visual");
  const [draft, setDraft] = useState<any>({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">(
    "saved",
  );
  const [rewrite, setRewrite] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const dragging = useRef<string | null>(null);
  const scenes: Scene[] = project.scenes || [];
  const selectedScene =
    scenes.find((scene) => scene.id === sceneId) || scenes[0];
  const stepIndex = WORKFLOW_STEPS.indexOf(step);
  const renderCredits = Math.ceil((project.durationSeconds * 50) / 15);

  const toDraft = useCallback(
    (scene: Scene) => ({
      ...scene,
      duration_seconds: scene.durationSeconds,
      character_action: scene.characterAction,
      camera_framing: scene.cameraFraming,
      camera_movement: scene.cameraMovement,
      product_visible: scene.productVisible,
      on_screen_text: scene.onScreenText || "",
    }),
    [],
  );
  useEffect(() => {
    if (selectedScene && !dirty) setDraft(toDraft(selectedScene));
  }, [selectedScene?.id, project.scenesRevision, dirty, toDraft]);
  useEffect(() => {
    window.localStorage.setItem(`marsfield-step-${project.id}`, step);
    window.history.replaceState(
      { ...window.history.state, marsfieldStep: step },
      "",
      `#${step.toLowerCase()}`,
    );
  }, [project.id, step]);
  useEffect(() => {
    const onPop = () => {
      const hash = window.location.hash.slice(1);
      const match = WORKFLOW_STEPS.find((item) => item.toLowerCase() === hash);
      if (match) setStep(match);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!dirty || !selectedScene) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const next = await api.updateInfluencerScene(
          project.id,
          selectedScene.id,
          draft,
        );
        setProject(next);
        setDirty(false);
        setSaveState("saved");
      } catch (err: any) {
        setSaveState("failed");
        setError(err.message || "Autosave failed");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, project.id, selectedScene?.id, setError, setProject]);

  const changeStep = (next: WorkflowStep) => {
    setStep(next);
    window.history.pushState(
      { marsfieldStep: next },
      "",
      `#${next.toLowerCase()}`,
    );
  };
  const updateDraft = (values: any) => {
    setDraft((current: any) => ({ ...current, ...values }));
    setDirty(true);
  };
  const add = async () => {
    setBusy("scene-action");
    try {
      const next = await api.addInfluencerScene(project.id, {
        title: `Scene ${scenes.length + 1}`,
        duration_seconds: 2,
        location: "To be defined",
        description: "Describe this scene.",
        character_action: "Define the character action.",
        expression: "Natural",
        wardrobe: scenes.at(-1)?.wardrobe || "Default wardrobe",
        camera_framing: "Medium shot",
        camera_movement: "Static",
        lighting: "Natural light",
        product_visible: false,
        dialogue: "",
        voiceover: "",
        on_screen_text: "",
        transition: "Cut",
      });
      setProject(next);
      setSceneId(next.scenes.at(-1)?.id || "");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const duplicate = async () => {
    if (!selectedScene) return;
    setBusy("scene-action");
    try {
      setProject(
        await api.duplicateInfluencerScene(project.id, selectedScene.id),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const remove = async () => {
    if (!selectedScene || scenes.length <= 2) return;
    setBusy("scene-action");
    try {
      const next = await api.deleteInfluencerScene(
        project.id,
        selectedScene.id,
      );
      setProject(next);
      setSceneId(next.scenes?.[0]?.id || "");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const reorder = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ordered = [...scenes];
    const from = ordered.findIndex((s) => s.id === fromId);
    const to = ordered.findIndex((s) => s.id === toId);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    try {
      setProject(
        await api.reorderInfluencerScenes(
          project.id,
          ordered.map((s) => s.id),
        ),
      );
    } catch (err: any) {
      setError(err.message);
    }
  };
  const rewriteScene = async () => {
    if (!selectedScene || !rewrite.trim()) return;
    setBusy("rewrite");
    try {
      const next = await api.rewriteInfluencerScene(
        project.id,
        selectedScene.id,
        rewrite,
      );
      setProject(next);
      setDraft(
        toDraft(next.scenes.find((s: Scene) => s.id === selectedScene.id)),
      );
      setRewrite("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const approveScenes = async () => {
    setBusy("approve-scenes");
    try {
      setProject(await api.approveInfluencerScenes(project.id));
      await refresh(project.id);
      changeStep("Storyboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const duplicateProject = async () => {
    setBusy("project-duplicate");
    try {
      const copy = await api.duplicateInfluencerProject(project.id);
      setProject(copy);
      window.localStorage.setItem("marsfield-last-project", copy.id);
      changeStep("Idea");
    } catch (err: any) {
      setError(err.message || "Could not create project variation");
    } finally {
      setBusy("");
    }
  };

  const preview = (
    <aside
      className={`creative-preview glass-card ${previewOpen ? "mobile-open" : ""}`}
      aria-label="Project preview"
    >
      <button
        className="preview-close"
        onClick={() => setPreviewOpen(false)}
        aria-label="Close preview"
      >
        ×
      </button>
      <div className="preview-header">
        <span>Live preview</span>
        <span className={`save-state ${saveState}`}>
          {saveState === "saving"
            ? "Saving…"
            : saveState === "failed"
              ? "Save failed · retrying"
              : "Saved"}
        </span>
      </div>
      <div
        className={`preview-frame ratio-${project.aspectRatio?.replace(":", "-")}`}
      >
        <div className="preview-gradient">
          <span className="preview-number">
            {selectedScene
              ? String(selectedScene.index + 1).padStart(2, "0")
              : "MF"}
          </span>
          <strong>{selectedScene?.title || project.title}</strong>
          <p>{selectedScene?.description || project.idea}</p>
        </div>
      </div>
      <div className="preview-meta">
        <span>{project.durationSeconds}s</span>
        <span>{project.aspectRatio}</span>
        <span>{scenes.length} scenes</span>
      </div>
      {project.storyboards?.find((board: Storyboard) => board.approved)
        ?.imageUrl && (
        <img
          className="approved-board"
          src={
            project.storyboards.find((board: Storyboard) => board.approved)
              .imageUrl
          }
          alt="Approved storyboard"
        />
      )}
    </aside>
  );

  return (
    <div className="creative-workspace">
      <nav className="workflow-stepper" aria-label="Project progress">
        {WORKFLOW_STEPS.map((item, index) => (
          <button
            key={item}
            onClick={() => changeStep(item)}
            aria-current={item === step ? "step" : undefined}
            className={`${item === step ? "active" : ""} ${index < stepIndex ? "complete" : ""}`}
          >
            <span>{index < stepIndex ? "✓" : index + 1}</span>
            {item}
          </button>
        ))}
      </nav>
      <div className="workspace-title">
        <div>
          <span className="badge badge-purple">
            {project.status.replaceAll("_", " ")}
          </span>
          <h2>{project.title}</h2>
        </div>
        <div className="workspace-title-actions">
          <button
            className="btn btn-secondary"
            disabled={Boolean(busy) || dirty}
            onClick={duplicateProject}
          >
            Create variation
          </button>
          <button
            className="btn btn-secondary mobile-preview-button"
            onClick={() => setPreviewOpen(true)}
          >
            Open preview
          </button>
        </div>
      </div>
      <div className="workspace-columns">
        <section className="stage-controls">
          {step === "Idea" && (
            <div className="stage-card">
              <p className="eyebrow">01 · Foundation</p>
              <h3>Shape the idea</h3>
              <p className="stage-intro">
                The creative direction that every later stage inherits.
              </p>
              <label style={field}>
                Video idea{" "}
                <span className="field-state required">Required</span>
                <textarea
                  className="form-textarea"
                  rows={5}
                  value={project.idea}
                  readOnly
                />
              </label>
              <div className="compact-grid">
                <label style={field}>
                  Duration{" "}
                  <span className="field-state inherited">Inherited</span>
                  <input
                    className="form-input"
                    value={`${project.durationSeconds} seconds`}
                    readOnly
                  />
                </label>
                <label style={field}>
                  Aspect ratio{" "}
                  <span className="field-state inherited">Inherited</span>
                  <input
                    className="form-input"
                    value={project.aspectRatio}
                    readOnly
                  />
                </label>
              </div>
              <details className="advanced">
                <summary>Advanced options</summary>
                <p>
                  Platform, audience, content format and creative objective are
                  inherited from the project brief.
                </p>
              </details>
            </div>
          )}
          {step === "Character" && (
            <div className="stage-card">
              <p className="eyebrow">02 · Identity</p>
              <h3>Character & product</h3>
              <p className="stage-intro">
                These locked references keep identity and packaging consistent.
              </p>
              <div className="selection-card selected">
                <div className="selection-avatar">
                  {project.influencer?.name?.[0] || "C"}
                </div>
                <div>
                  <span className="field-state locked">Locked</span>
                  <h4>{project.influencer?.name || "Approved character"}</h4>
                  <p>
                    {project.influencer?.profile?.content_niche ||
                      "Character identity reference"}
                  </p>
                </div>
              </div>
              {project.product ? (
                <div className="selection-card selected">
                  <div className="selection-avatar product">P</div>
                  <div>
                    <span className="field-state inherited">Inherited</span>
                    <h4>{project.product.name}</h4>
                    <p>{project.product.brandName || "Product reference"}</p>
                  </div>
                </div>
              ) : (
                <div className="optional-empty">
                  No product selected <span>Optional</span>
                </div>
              )}
              <div className="invalidation-note">
                Changing the character after storyboarding requires the
                storyboard and video to be regenerated.
              </div>
            </div>
          )}
          {step === "Scenes" && (
            <div className="stage-card scenes-stage">
              <div className="stage-heading">
                <div>
                  <p className="eyebrow">03 · Sequence</p>
                  <h3>Build your scenes</h3>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={plan}
                  disabled={Boolean(busy)}
                >
                  {scenes.length ? "Regenerate plan" : "Generate free plan"}
                </button>
              </div>
              {!scenes.length ? (
                <div className="empty-scenes">
                  <strong>Ready to draft your sequence</strong>
                  <p>
                    Generate an intelligent scene plan from your idea, duration
                    and character.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="scene-filmstrip"
                    role="tablist"
                    aria-label="Scenes"
                  >
                    {scenes.map((scene, index) => (
                      <button
                        draggable
                        key={scene.id}
                        role="tab"
                        aria-selected={scene.id === selectedScene?.id}
                        disabled={
                          scene.id !== selectedScene?.id &&
                          (dirty || saveState === "saving")
                        }
                        title={
                          scene.id !== selectedScene?.id && dirty
                            ? "Waiting for this scene to save"
                            : `Edit scene ${index + 1}`
                        }
                        className={
                          scene.id === selectedScene?.id ? "active" : ""
                        }
                        onDragStart={() => {
                          dragging.current = scene.id;
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() =>
                          dragging.current &&
                          reorder(dragging.current, scene.id)
                        }
                        onClick={() => setSceneId(scene.id)}
                      >
                        <span>Scene {index + 1}</span>
                        <strong>{scene.title}</strong>
                        <small>
                          {scene.durationSeconds}s · drag to reorder
                        </small>
                      </button>
                    ))}
                    {scenes.length < 6 && (
                      <button
                        className="add-scene"
                        onClick={add}
                        disabled={dirty || saveState === "saving"}
                      >
                        + Add scene
                      </button>
                    )}
                  </div>
                  <div className="scene-toolbar">
                    <span>Editing Scene {selectedScene.index + 1}</span>
                    <div>
                      <button
                        onClick={duplicate}
                        disabled={Boolean(busy) || scenes.length >= 6}
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={remove}
                        disabled={Boolean(busy) || scenes.length <= 2}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="scene-tabs" role="tablist">
                    {(
                      [
                        "Visual",
                        "Action",
                        "Camera",
                        "Dialogue",
                        "Transition",
                      ] as SceneTab[]
                    ).map((item) => (
                      <button
                        key={item}
                        role="tab"
                        aria-selected={sceneTab === item}
                        className={sceneTab === item ? "active" : ""}
                        onClick={() => setSceneTab(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <div className="scene-editor">
                    <div className="compact-grid">
                      <label style={field}>
                        Title{" "}
                        <span className="field-state required">Required</span>
                        <input
                          className="form-input"
                          value={draft.title || ""}
                          onChange={(e) =>
                            updateDraft({ title: e.target.value })
                          }
                        />
                      </label>
                      <label style={field}>
                        Duration
                        <input
                          className="form-input"
                          type="number"
                          min={1}
                          value={draft.duration_seconds || 1}
                          onChange={(e) =>
                            updateDraft({
                              duration_seconds: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    {sceneTab === "Visual" && (
                      <>
                        <label style={field}>
                          Scene description{" "}
                          <span className="field-state required">Required</span>
                          <textarea
                            className="form-textarea"
                            rows={4}
                            value={draft.description || ""}
                            onChange={(e) =>
                              updateDraft({ description: e.target.value })
                            }
                          />
                        </label>
                        <label style={field}>
                          Location
                          <input
                            className="form-input"
                            value={draft.location || ""}
                            onChange={(e) =>
                              updateDraft({ location: e.target.value })
                            }
                          />
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.product_visible)}
                            onChange={(e) =>
                              updateDraft({ product_visible: e.target.checked })
                            }
                          />{" "}
                          Show product in this scene
                        </label>
                        <details className="advanced">
                          <summary>Advanced visual controls</summary>
                          <label style={field}>
                            Wardrobe
                            <input
                              className="form-input"
                              value={draft.wardrobe || ""}
                              onChange={(e) =>
                                updateDraft({ wardrobe: e.target.value })
                              }
                            />
                          </label>
                          <label style={field}>
                            Lighting
                            <input
                              className="form-input"
                              value={draft.lighting || ""}
                              onChange={(e) =>
                                updateDraft({ lighting: e.target.value })
                              }
                            />
                          </label>
                        </details>
                      </>
                    )}
                    {sceneTab === "Action" && (
                      <>
                        <label style={field}>
                          Character action{" "}
                          <span className="field-state required">Required</span>
                          <textarea
                            className="form-textarea"
                            rows={4}
                            value={draft.character_action || ""}
                            onChange={(e) =>
                              updateDraft({ character_action: e.target.value })
                            }
                          />
                        </label>
                        <label style={field}>
                          Expression
                          <input
                            className="form-input"
                            value={draft.expression || ""}
                            onChange={(e) =>
                              updateDraft({ expression: e.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                    {sceneTab === "Camera" && (
                      <>
                        <label style={field}>
                          Framing
                          <select
                            className="form-select"
                            value={draft.camera_framing || ""}
                            onChange={(e) =>
                              updateDraft({ camera_framing: e.target.value })
                            }
                          >
                            <option>Close-up</option>
                            <option>Medium shot</option>
                            <option>Wide shot</option>
                            <option>Over-the-shoulder</option>
                          </select>
                        </label>
                        <details className="advanced">
                          <summary>Advanced camera controls</summary>
                          <label style={field}>
                            Camera movement
                            <input
                              className="form-input"
                              value={draft.camera_movement || ""}
                              onChange={(e) =>
                                updateDraft({ camera_movement: e.target.value })
                              }
                            />
                          </label>
                        </details>
                      </>
                    )}
                    {sceneTab === "Dialogue" && (
                      <>
                        <label style={field}>
                          Spoken dialogue{" "}
                          <span className="field-state">Optional</span>
                          <textarea
                            className="form-textarea"
                            rows={3}
                            value={draft.dialogue || ""}
                            onChange={(e) =>
                              updateDraft({ dialogue: e.target.value })
                            }
                          />
                        </label>
                        <label style={field}>
                          Voiceover{" "}
                          <span className="field-state">Optional</span>
                          <textarea
                            className="form-textarea"
                            rows={3}
                            value={draft.voiceover || ""}
                            onChange={(e) =>
                              updateDraft({ voiceover: e.target.value })
                            }
                          />
                        </label>
                        <label style={field}>
                          On-screen text
                          <input
                            className="form-input"
                            value={draft.on_screen_text || ""}
                            onChange={(e) =>
                              updateDraft({ on_screen_text: e.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                    {sceneTab === "Transition" && (
                      <label style={field}>
                        Transition
                        <select
                          className="form-select"
                          value={draft.transition || "Cut"}
                          onChange={(e) =>
                            updateDraft({ transition: e.target.value })
                          }
                        >
                          <option>Cut</option>
                          <option>Dissolve</option>
                          <option>Match cut</option>
                          <option>Whip pan</option>
                          <option>Fade</option>
                        </select>
                      </label>
                    )}
                    <div className="rewrite-row">
                      <input
                        className="form-input"
                        placeholder="Ask AI to make the hook stronger…"
                        value={rewrite}
                        onChange={(e) => setRewrite(e.target.value)}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={rewriteScene}
                        disabled={!rewrite.trim() || Boolean(busy)}
                      >
                        AI rewrite · free
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {step === "Storyboard" &&
            ([
              "scenes_approved",
              "storyboard_ready",
              "storyboard_approved",
              "video_ready",
            ].includes(project.status) ? (
              <StoryboardStudio
                project={project}
                setProject={setProject}
                setBusy={setBusy}
                busy={busy}
                setError={setError}
              />
            ) : (
              <div className="stage-card locked-stage">
                <span>🔒</span>
                <h3>Approve scenes first</h3>
                <p>
                  Your scene plan must be approved before generating a paid
                  storyboard.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => changeStep("Scenes")}
                >
                  Review scenes
                </button>
              </div>
            ))}
          {step === "Video" &&
            (["storyboard_approved", "video_ready"].includes(project.status) ? (
              <VideoStudio
                project={project}
                setProject={setProject}
                setBusy={setBusy}
                busy={busy}
                setError={setError}
              />
            ) : (
              <div className="stage-card locked-stage">
                <span>🔒</span>
                <h3>Approve a storyboard first</h3>
                <p>
                  Video generation unlocks after you select a storyboard
                  version.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => changeStep("Storyboard")}
                >
                  Go to storyboard
                </button>
              </div>
            ))}
          {step === "Review" && (
            <div className="stage-card">
              <p className="eyebrow">06 · Final check</p>
              <h3>Review before generation</h3>
              <p className="stage-intro">
                Nothing is charged until you confirm Generate.
              </p>
              <dl className="review-list">
                <div>
                  <dt>Character</dt>
                  <dd>{project.influencer?.name || "Approved character"}</dd>
                </div>
                <div>
                  <dt>Product</dt>
                  <dd>{project.product?.name || "None"}</dd>
                </div>
                <div>
                  <dt>Scenes</dt>
                  <dd>{scenes.length}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{project.durationSeconds} seconds</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>Kling V3</dd>
                </div>
                <div>
                  <dt>Aspect ratio</dt>
                  <dd>{project.aspectRatio}</dd>
                </div>
                <div className="credit-row">
                  <dt>Estimated cost</dt>
                  <dd>{renderCredits} credits</dd>
                </div>
              </dl>
              {!project.storyboards?.some((b: Storyboard) => b.approved) && (
                <div className="invalidation-note">
                  Select an approved storyboard before final video generation.
                </div>
              )}
              <button
                className="btn btn-primary review-generate"
                disabled={
                  !project.storyboards?.some((b: Storyboard) => b.approved) ||
                  Boolean(busy)
                }
                onClick={() => changeStep("Video")}
              >
                {project.videoGenerations?.length
                  ? `Regenerate video · ${renderCredits} credits`
                  : `Continue to generate · ${renderCredits} credits`}
              </button>
              <p className="duplicate-note">
                Generation buttons lock while a request is active to prevent
                duplicate charges.
              </p>
            </div>
          )}
        </section>
        {preview}
      </div>
      <footer className="workspace-footer">
        <div>
          <span className={`save-state ${saveState}`}>
            {saveState === "saving"
              ? "Saving draft…"
              : saveState === "failed"
                ? "Save failed"
                : "Draft saved"}
          </span>
        </div>
        <div>
          <button
            className="btn btn-secondary"
            disabled={stepIndex === 0}
            onClick={() => changeStep(WORKFLOW_STEPS[stepIndex - 1])}
          >
            ← Back
          </button>
          {step === "Scenes" && scenes.length ? (
            <button
              className="btn btn-primary"
              disabled={Boolean(busy) || dirty}
              onClick={approveScenes}
            >
              Approve & continue
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={stepIndex === WORKFLOW_STEPS.length - 1}
              onClick={() => changeStep(WORKFLOW_STEPS[stepIndex + 1])}
            >
              Continue →
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function ProjectEditor({
  project,
  setProject,
  refresh,
  plan,
  busy,
  setBusy,
  setError,
}: any) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [rewrite, setRewrite] = useState("");
  const edit = (scene: Scene) => {
    setEditing(scene.id);
    setDraft({
      ...scene,
      duration_seconds: scene.durationSeconds,
      character_action: scene.characterAction,
      camera_framing: scene.cameraFraming,
      camera_movement: scene.cameraMovement,
      product_visible: scene.productVisible,
      on_screen_text: scene.onScreenText || "",
    });
  };
  const save = async (sceneId: string) => {
    setBusy("save");
    try {
      setProject(await api.updateInfluencerScene(project.id, sceneId, draft));
      setEditing(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const rewriteScene = async (sceneId: string) => {
    setBusy("rewrite");
    try {
      setProject(
        await api.rewriteInfluencerScene(project.id, sceneId, rewrite),
      );
      setRewrite("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const approve = async () => {
    setBusy("approve-scenes");
    try {
      setProject(await api.approveInfluencerScenes(project.id));
      await refresh(project.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const add = async () => {
    setBusy("scene-action");
    try {
      setProject(
        await api.addInfluencerScene(project.id, {
          title: `Scene ${(project.scenes?.length || 0) + 1}`,
          duration_seconds: 1,
          location: "To be defined",
          description: "Describe this scene.",
          character_action: "Define the influencer action.",
          expression: "Natural",
          wardrobe:
            project.scenes?.[project.scenes.length - 1]?.wardrobe ||
            "Default wardrobe",
          camera_framing: "Medium shot",
          camera_movement: "Static",
          lighting: "Natural light",
          product_visible: false,
          dialogue: "",
          voiceover: "",
          on_screen_text: "",
          transition: "Cut",
        }),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const duplicateProject = async () => {
    setBusy("project-duplicate");
    try {
      const copy = await api.duplicateInfluencerProject(project.id);
      setProject(copy);
      await refresh(copy.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const duplicate = async (sceneId: string) => {
    setBusy("scene-action");
    try {
      setProject(await api.duplicateInfluencerScene(project.id, sceneId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const remove = async (sceneId: string) => {
    setBusy("scene-action");
    try {
      setProject(await api.deleteInfluencerScene(project.id, sceneId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const move = async (index: number, direction: number) => {
    const ordered = [...(project.scenes || [])];
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusy("scene-action");
    try {
      setProject(
        await api.reorderInfluencerScenes(
          project.id,
          ordered.map((scene: Scene) => scene.id),
        ),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  const keys = [
    { k: "location", l: "Location" },
    { k: "description", l: "Description" },
    { k: "character_action", l: "Action" },
    { k: "expression", l: "Expression" },
    { k: "wardrobe", l: "Wardrobe" },
    { k: "camera_framing", l: "Camera framing" },
    { k: "camera_movement", l: "Camera movement" },
    { k: "lighting", l: "Lighting" },
    { k: "dialogue", l: "Dialogue" },
    { k: "voiceover", l: "Voiceover" },
    { k: "on_screen_text", l: "On-screen text" },
    { k: "transition", l: "Transition" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <section className="glass-card">
        <span className="badge badge-purple">{project.status}</span>
        <h2>{project.title}</h2>
        <p>{project.idea}</p>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <span className="badge badge-purple">
            {project.durationSeconds} seconds
          </span>
          <span className="badge badge-purple">{project.aspectRatio}</span>
          <button
            className="btn btn-primary"
            disabled={busy === "plan"}
            onClick={plan}
          >
            {project.scenes?.length
              ? "Regenerate free scene plan"
              : "Generate free scene plan"}
          </button>
          {project.scenes?.length > 0 && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={approve}
            >
              Approve scene plan
            </button>
          )}
          <button
            className="btn btn-secondary"
            disabled={Boolean(busy)}
            onClick={duplicateProject}
          >
            Create variation
          </button>
          {project.scenes?.length > 0 && project.scenes.length < 6 && (
            <button
              className="btn btn-secondary"
              disabled={Boolean(busy)}
              onClick={add}
            >
              Add scene
            </button>
          )}
        </div>
      </section>
      {project.scenes?.length > 0 && (
        <section className="glass-card">
          <strong>Scene order and copies</strong>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: ".45rem",
              marginTop: ".7rem",
            }}
          >
            {project.scenes.map((scene: Scene, index: number) => (
              <div
                key={scene.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".4rem",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ flex: 1, minWidth: 150 }}>
                  {index + 1}. {scene.title}
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={index === 0 || busy}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={index === project.scenes.length - 1 || busy}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={project.scenes.length >= 6 || busy}
                  onClick={() => duplicate(scene.id)}
                >
                  Duplicate
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={project.scenes.length <= 2 || busy}
                  onClick={() => remove(scene.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {project.scenes?.map((scene: Scene) => (
        <article key={scene.id} className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <span className="badge badge-purple">
                Scene {scene.index + 1} · {scene.durationSeconds}s
              </span>
              <h3>{scene.title}</h3>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() =>
                editing === scene.id ? setEditing(null) : edit(scene)
              }
            >
              {editing === scene.id ? "Cancel" : "Edit scene"}
            </button>
          </div>
          {editing === scene.id ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}
            >
              <div style={grid}>
                <label style={field}>
                  Title
                  <input
                    className="form-input"
                    value={draft.title || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label style={field}>
                  Duration
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    value={draft.duration_seconds}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        duration_seconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              {keys.map(({ k, l }) => (
                <label key={k} style={field}>
                  {l}
                  <textarea
                    className="form-textarea"
                    rows={
                      k === "description" || k === "character_action" ? 3 : 2
                    }
                    value={draft[k] || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label style={field}>
                <span>
                  <input
                    type="checkbox"
                    checked={Boolean(draft.product_visible)}
                    onChange={(e) =>
                      setDraft({ ...draft, product_visible: e.target.checked })
                    }
                  />{" "}
                  Product visible
                </span>
              </label>
              <button
                className="btn btn-primary"
                onClick={() => save(scene.id)}
              >
                Save scene
              </button>
            </div>
          ) : (
            <>
              <p>{scene.description}</p>
              <div style={grid}>
                <small>
                  <strong>Action</strong>
                  <br />
                  {scene.characterAction}
                </small>
                <small>
                  <strong>Camera</strong>
                  <br />
                  {scene.cameraFraming} · {scene.cameraMovement}
                </small>
                <small>
                  <strong>Location</strong>
                  <br />
                  {scene.location}
                </small>
                <small>
                  <strong>Wardrobe</strong>
                  <br />
                  {scene.wardrobe}
                </small>
              </div>
              <div style={{ display: "flex", gap: ".5rem", marginTop: "1rem" }}>
                <input
                  className="form-input"
                  placeholder="Rewrite: make the hook stronger..."
                  value={rewrite}
                  onChange={(e) => setRewrite(e.target.value)}
                />
                <button
                  className="btn btn-secondary"
                  disabled={!rewrite.trim() || busy === "rewrite"}
                  onClick={() => rewriteScene(scene.id)}
                >
                  AI rewrite · free
                </button>
              </div>
            </>
          )}
        </article>
      ))}
      {[
        "scenes_approved",
        "storyboard_ready",
        "storyboard_approved",
        "video_ready",
      ].includes(project.status) && (
        <StoryboardStudio
          project={project}
          setProject={setProject}
          setBusy={setBusy}
          busy={busy}
          setError={setError}
        />
      )}
      {["storyboard_approved", "video_ready"].includes(project.status) && (
        <VideoStudio
          project={project}
          setProject={setProject}
          setBusy={setBusy}
          busy={busy}
          setError={setError}
        />
      )}
    </div>
  );
}

function StoryboardStudio({
  project,
  setProject,
  setBusy,
  busy,
  setError,
}: any) {
  const [style, setStyle] = useState(
    "photorealistic premium UGC, natural smartphone cinematography, realistic skin and believable environments",
  );
  const [consistency, setConsistency] = useState(
    "Prioritize exact facial identity, wardrobe continuity and accurate product packaging.",
  );
  const [progress, setProgress] = useState("");
  const recoveryKey = `marsfield-storyboard-generation-${project.id}`;
  const recoveryStarted = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(recoveryKey);
    if (!stored || recoveryStarted.current) return;
    recoveryStarted.current = true;
    const resume = async () => {
      setBusy("storyboard");
      setProgress("Resuming storyboard generation…");
      try {
        const { prepared, predictionId } = JSON.parse(stored);
        let result = await api.getPrediction(predictionId);
        for (
          let attempt = 0;
          attempt < 90 &&
          !["succeeded", "failed", "canceled"].includes(result.status);
          attempt += 1
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
          result = await api.getPrediction(predictionId);
        }
        if (result.status !== "succeeded")
          throw new Error(result.error || "Storyboard generation did not complete");
        await api.saveInfluencerStoryboard(project.id, {
          prediction_id: predictionId,
          prompt: prepared.prompt,
          layout: prepared.layout,
          visual_style: prepared.visual_style,
          reference_storage_ids: prepared.reference_storage_ids,
          scenes_revision: prepared.scenes_revision,
        });
        window.localStorage.removeItem(recoveryKey);
        setProject(await api.getInfluencerProject(project.id));
        setProgress("");
      } catch (err: any) {
        window.localStorage.removeItem(recoveryKey);
        setError(err.message || "Could not resume storyboard generation");
        setProgress("");
      } finally {
        setBusy("");
      }
    };
    void resume();
  }, [project.id, recoveryKey, setBusy, setError, setProject]);

  const generate = async () => {
    setBusy("storyboard");
    setError("");
    setProgress("Preparing storyboard prompt…");
    try {
      const prepared = await api.prepareInfluencerStoryboard(project.id, {
        visual_style: style,
        consistency_instruction: consistency,
      });
      setProgress("Nano Banana 2 is generating one unified storyboard…");
      const submitted = await api.generate({
        workflow: prepared.generation.workflow,
        model: prepared.generation.model,
        prompt: prepared.prompt,
        params: {
          ...prepared.generation.params,
          reference_image_ids: prepared.reference_storage_ids,
        },
      });
      window.localStorage.setItem(
        recoveryKey,
        JSON.stringify({ prepared, predictionId: submitted.id }),
      );
      let result = await api.getPrediction(submitted.id);
      for (
        let attempt = 0;
        attempt < 90 &&
        !["succeeded", "failed", "canceled"].includes(result.status);
        attempt += 1
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        result = await api.getPrediction(submitted.id);
      }
      if (result.status !== "succeeded")
        throw new Error(
          result.error || "Storyboard generation did not complete",
        );
      setProgress("Saving immutable storyboard version…");
      await api.saveInfluencerStoryboard(project.id, {
        prediction_id: submitted.id,
        prompt: prepared.prompt,
        layout: prepared.layout,
        visual_style: prepared.visual_style,
        reference_storage_ids: prepared.reference_storage_ids,
        scenes_revision: prepared.scenes_revision,
      });
      window.localStorage.removeItem(recoveryKey);
      setProject(await api.getInfluencerProject(project.id));
      setProgress("");
    } catch (err: any) {
      window.localStorage.removeItem(recoveryKey);
      setError(err.message || "Storyboard generation failed");
      setProgress("");
    } finally {
      setBusy("");
    }
  };

  const approve = async (id: string) => {
    setBusy("storyboard-approve");
    try {
      setProject(await api.approveInfluencerStoryboard(project.id, id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <section
      className="glass-card"
      style={{ borderColor: "rgba(139,92,246,.5)" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="badge badge-purple">Storyboard</span>
          <h3>Unified visual blueprint</h3>
          <p style={{ color: "var(--foreground-muted)", maxWidth: 720 }}>
            One image contains every approved scene and becomes Kling V3’s
            primary visual reference. Regeneration always creates a new version.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={Boolean(busy)}
          onClick={generate}
        >
          {project.storyboards?.length
            ? "Generate new version · 1 credit"
            : "Generate storyboard · 1 credit"}
        </button>
      </div>
      <div style={grid}>
        <label style={field}>
          Visual style
          <input
            className="form-input"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          />
        </label>
        <label style={field}>
          Consistency instruction
          <input
            className="form-input"
            value={consistency}
            onChange={(e) => setConsistency(e.target.value)}
          />
        </label>
      </div>
      {progress && <p style={{ color: "#c4b5fd" }}>{progress}</p>}
      {project.storyboards?.length > 0 && (
        <div style={{ ...grid, marginTop: "1rem" }}>
          {project.storyboards.map((board: Storyboard) => {
            const stale = board.scenesRevision !== project.scenesRevision;
            return (
              <article
                key={board.id}
                style={{
                  border: `1px solid ${board.approved ? "#8b5cf6" : "var(--panel-border)"}`,
                  borderRadius: 14,
                  padding: ".75rem",
                  background: "rgba(255,255,255,.02)",
                }}
              >
                <img
                  src={board.imageUrl}
                  alt={`Storyboard version ${board.version}`}
                  style={{
                    width: "100%",
                    maxHeight: 520,
                    objectFit: "contain",
                    borderRadius: 10,
                    background: "#050505",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: ".5rem",
                    alignItems: "center",
                    marginTop: ".7rem",
                  }}
                >
                  <div>
                    <strong>Version {board.version}</strong>
                    <small
                      style={{
                        display: "block",
                        color: "var(--foreground-muted)",
                      }}
                    >
                      {board.layout} ·{" "}
                      {stale
                        ? "older scene revision"
                        : board.approved
                          ? "approved"
                          : "ready"}
                    </small>
                  </div>
                  <button
                    className="btn btn-secondary"
                    disabled={stale || board.approved || Boolean(busy)}
                    onClick={() => approve(board.id)}
                  >
                    {board.approved ? "Selected" : "Approve"}
                  </button>
                </div>
                <details style={{ marginTop: ".6rem" }}>
                  <summary>Generation details</summary>
                  <p
                    style={{
                      fontSize: ".72rem",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    {board.visualStyle}
                  </p>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: ".68rem",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    {board.prompt}
                  </pre>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function VideoStudio({ project, setProject, setBusy, busy, setError }: any) {
  const [motion, setMotion] = useState(
    "Use natural human movement, confident social pacing, smooth motivated camera motion and clean transitions.",
  );
  const [progress, setProgress] = useState("");
  const recoveryKey = `marsfield-video-generation-${project.id}`;
  const recoveryStarted = useRef(false);
  const renderCredits = Math.ceil((project.durationSeconds * 50) / 15);

  useEffect(() => {
    const stored = window.localStorage.getItem(recoveryKey);
    if (!stored || recoveryStarted.current) return;
    recoveryStarted.current = true;
    const resume = async () => {
      setBusy("video");
      setProgress("Resuming video generation…");
      try {
        const { prepared, predictionId } = JSON.parse(stored);
        let result = await api.getPrediction(predictionId);
        for (
          let attempt = 0;
          attempt < 150 &&
          !["succeeded", "failed", "canceled"].includes(result.status);
          attempt += 1
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          result = await api.getPrediction(predictionId);
        }
        if (result.status !== "succeeded")
          throw new Error(result.error || "Kling V3 generation did not complete");
        await api.saveInfluencerVideo(project.id, {
          prediction_id: predictionId,
          storyboard_id: prepared.storyboard_id,
          prompt: prepared.prompt,
          motion_instructions: prepared.motion_instructions,
          settings: prepared.generation.params,
        });
        window.localStorage.removeItem(recoveryKey);
        setProject(await api.getInfluencerProject(project.id));
        setProgress("");
      } catch (err: any) {
        window.localStorage.removeItem(recoveryKey);
        setError(err.message || "Could not resume video generation");
        setProgress("");
      } finally {
        setBusy("");
      }
    };
    void resume();
  }, [project.id, recoveryKey, setBusy, setError, setProject]);

  const generate = async () => {
    setBusy("video");
    setError("");
    setProgress(
      "Preparing storyboard, identity and product references for Kling V3…",
    );
    try {
      const prepared = await api.prepareInfluencerVideo(project.id, {
        motion_instructions: motion,
      });
      setProgress(
        `Generating ${project.durationSeconds}-second video with synchronized audio…`,
      );
      const submitted = await api.generate({
        workflow: prepared.generation.workflow,
        model: prepared.generation.model,
        prompt: prepared.prompt,
        params: {
          ...prepared.generation.params,
          reference_image_ids: prepared.reference_storage_ids,
        },
      });
      window.localStorage.setItem(
        recoveryKey,
        JSON.stringify({ prepared, predictionId: submitted.id }),
      );
      let result = await api.getPrediction(submitted.id);
      for (
        let attempt = 0;
        attempt < 150 &&
        !["succeeded", "failed", "canceled"].includes(result.status);
        attempt += 1
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        result = await api.getPrediction(submitted.id);
      }
      if (result.status !== "succeeded")
        throw new Error(result.error || "Kling V3 generation did not complete");
      setProgress("Saving video attempt…");
      await api.saveInfluencerVideo(project.id, {
        prediction_id: submitted.id,
        storyboard_id: prepared.storyboard_id,
        prompt: prepared.prompt,
        motion_instructions: prepared.motion_instructions,
        settings: prepared.generation.params,
      });
      window.localStorage.removeItem(recoveryKey);
      setProject(await api.getInfluencerProject(project.id));
      setProgress("");
    } catch (err: any) {
      window.localStorage.removeItem(recoveryKey);
      setError(err.message || "Video generation failed");
      setProgress("");
    } finally {
      setBusy("");
    }
  };
  const approve = async (id: string) => {
    setBusy("video-approve");
    try {
      setProject(await api.approveInfluencerVideo(project.id, id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <section
      className="glass-card"
      style={{ borderColor: "rgba(34,197,94,.4)" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="badge badge-purple">Final video</span>
          <h3>Kling V3 production</h3>
          <p style={{ color: "var(--foreground-muted)", maxWidth: 700 }}>
            The approved storyboard remains unchanged. Every regeneration
            creates a separate Kling V3 attempt with generated speech,
            voiceover, ambience and sound. Pricing scales with duration up to 50
            credits for 15 seconds.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={Boolean(busy)}
          onClick={generate}
        >
          {project.videoGenerations?.length
            ? `Regenerate · ${renderCredits} credits`
            : `Generate final video · ${renderCredits} credits`}
        </button>
      </div>
      <label style={field}>
        Motion and performance instructions
        <textarea
          className="form-textarea"
          rows={3}
          value={motion}
          onChange={(e) => setMotion(e.target.value)}
        />
      </label>
      {progress && <p style={{ color: "#86efac" }}>{progress}</p>}
      {project.videoGenerations?.length > 0 && (
        <div style={{ ...grid, marginTop: "1rem" }}>
          {project.videoGenerations.map((video: VideoGeneration) => (
            <article
              key={video.id}
              style={{
                border: `1px solid ${video.approved ? "#22c55e" : "var(--panel-border)"}`,
                borderRadius: 14,
                padding: ".75rem",
                background: "rgba(255,255,255,.02)",
              }}
            >
              <video
                src={video.videoUrl}
                controls
                playsInline
                style={{
                  width: "100%",
                  maxHeight: 560,
                  borderRadius: 10,
                  background: "#000",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: ".6rem",
                  marginTop: ".7rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>Attempt {video.attempt}</strong>
                  <small
                    style={{
                      display: "block",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    {video.creditsUsed} credits ·{" "}
                    {video.approved ? "approved" : "ready for review"}
                  </small>
                </div>
                <div style={{ display: "flex", gap: ".4rem" }}>
                  <a
                    className="btn btn-secondary"
                    href={video.videoUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download
                  </a>
                  <button
                    className="btn btn-primary"
                    disabled={video.approved || Boolean(busy)}
                    onClick={() => approve(video.id)}
                  >
                    {video.approved ? "Approved" : "Approve video"}
                  </button>
                </div>
              </div>
              <details style={{ marginTop: ".6rem" }}>
                <summary>Prompt and settings</summary>
                <p
                  style={{
                    color: "var(--foreground-muted)",
                    fontSize: ".72rem",
                  }}
                >
                  {video.motionInstructions}
                </p>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    color: "var(--foreground-muted)",
                    fontSize: ".68rem",
                  }}
                >
                  {video.prompt}
                </pre>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
