'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './layout';
import { CinematicControls } from '@/components/CinematicControls';
import { buildCinematicPrompt, DEFAULT_CINEMATIC_SETTINGS } from '@/lib/cinematic';
import { DynamicModelControls } from '@/components/DynamicModelControls';
import { ControlKey, getModelDefinition, getModelsForWorkflow } from '@/lib/model-registry';

interface ReferenceFile {
  name: string;
  id: string;
  url: string;
  kind: 'image' | 'video' | 'audio';
}

interface ProjectOption {
  id: string;
  name: string;
}

interface VariationResult {
  id: string;
  status: string;
  url?: string;
  variationIndex: number;
  type: string;
}

interface LibraryAsset {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  thumbnailUrl: string | null;
  storageObjectId: string | null;
  storageObject?: { mimeType?: string | null; byteSize?: number | null } | null;
  prediction?: { prompt?: string | null; model?: string; workflow?: string } | null;
}

const KLING_EDIT_PRESETS = [
  { id: 'custom', label: 'Custom edit', prompt: '' },
  { id: 'replace-person', label: 'Replace a person', prompt: 'Replace the person in <<<video_1>>> with the person from <<<image_1>>>, preserving the original motion, framing, lighting, and scene.' },
  { id: 'replace-product', label: 'Replace a product or prop', prompt: 'Replace the primary product or prop in <<<video_1>>> with the object from <<<image_1>>>, preserving interactions, scale, reflections, camera motion, and scene continuity.' },
  { id: 'change-clothing', label: 'Change clothing', prompt: 'Change the main person\'s clothing in <<<video_1>>> to match <<<image_1>>>, preserving identity, movement, lighting, and the original scene.' },
  { id: 'replace-background', label: 'Replace the background', prompt: 'Replace the background in <<<video_1>>> with the environment shown in <<<image_1>>>, preserving the foreground subject, motion, perspective, lighting, and realistic edges.' },
  { id: 'remove-object', label: 'Remove an object or person', prompt: 'Remove the specified unwanted object or person from <<<video_1>>> and naturally reconstruct the occluded background while preserving all other motion and sound.' },
  { id: 'lighting-weather', label: 'Change lighting or weather', prompt: 'Transform the lighting and weather in <<<video_1>>> as described, preserving every subject, action, camera movement, and scene geometry.' },
  { id: 'restyle', label: 'Change visual style', prompt: 'Restyle <<<video_1>>> according to the description while preserving subject identity, action, timing, composition, and camera movement.' },
  { id: 'camera', label: 'Alternate camera treatment', prompt: 'Reinterpret <<<video_1>>> with the described camera treatment while preserving the subjects, action, timing, location, and continuity.' },
] as const;

const KLING_REFERENCE_MIN_SECONDS = 3;
const KLING_REFERENCE_MAX_SECONDS = 9.8;

export default function StudioPage() {
  const { user, token } = useAuth();
  const [workflow, setWorkflow] = useState('text-to-video');
  const [model, setModel] = useState('alibaba/happyhorse-1.1');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(30);
  const [cameraMove, setCameraMove] = useState('none');
  const [motionStrength, setMotionStrength] = useState(1);
  const [resolution, setResolution] = useState('720p');
  const [imageResolution, setImageResolution] = useState('1K');
  const [imageOutputFormat, setImageOutputFormat] = useState('jpg');
  const [recraftStyle, setRecraftStyle] = useState('any');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [generateAudio, setGenerateAudio] = useState(true);
  const [klingMode, setKlingMode] = useState('pro');
  const [klingEditPreset, setKlingEditPreset] = useState('custom');
  const [keepOriginalSound, setKeepOriginalSound] = useState(true);
  const [upscaleFactor, setUpscaleFactor] = useState('2');
  const [upscaleTargetMp, setUpscaleTargetMp] = useState(8);
  const [upscaleQuality, setUpscaleQuality] = useState(90);
  const [upscaleCreativity, setUpscaleCreativity] = useState(0);
  const [enhanceDetails, setEnhanceDetails] = useState(false);
  const [captionPreset, setCaptionPreset] = useState<'social' | 'landscape'>('social');
  const [captionPosition, setCaptionPosition] = useState('bottom75');
  const [captionColor, setCaptionColor] = useState('white');
  const [captionHighlightColor, setCaptionHighlightColor] = useState('yellow');
  const [captionStrokeColor, setCaptionStrokeColor] = useState('black');
  const [captionFont, setCaptionFont] = useState('Poppins/Poppins-ExtraBold.ttf');
  const [captionFontSize, setCaptionFontSize] = useState(4);
  const [captionMaxChars, setCaptionMaxChars] = useState(10);
  const [captionOpacity, setCaptionOpacity] = useState(0);
  const [captionStrokeWidth, setCaptionStrokeWidth] = useState(2.6);
  const [captionKerning, setCaptionKerning] = useState(-5);
  const [captionRightToLeft, setCaptionRightToLeft] = useState(false);
  const [captionTranslate, setCaptionTranslate] = useState(false);
  const [resizeFormat, setResizeFormat] = useState<'vertical' | 'square' | 'landscape'>('vertical');
  const [resizeMode, setResizeMode] = useState<'crop' | 'fit'>('crop');
  const [enhanceRealism, setEnhanceRealism] = useState(false);
  const [enhanceTargetResolution, setEnhanceTargetResolution] = useState('1080p');
  const [enhanceTargetFps, setEnhanceTargetFps] = useState(30);
  const [extensionDuration, setExtensionDuration] = useState(6);
  const [enhancementQuote, setEnhancementQuote] = useState<number | null>(null);
  const [enhancementQuoteError, setEnhancementQuoteError] = useState('');
  const [cinematicSettings, setCinematicSettings] = useState(DEFAULT_CINEMATIC_SETTINGS);
  const [referenceVideoDuration, setReferenceVideoDuration] = useState<number | null>(null);
  const [seed, setSeed] = useState('');
  const [variations, setVariations] = useState(1);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [quickProjectName, setQuickProjectName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [lastGeneratedAsset, setLastGeneratedAsset] = useState<{ id: string; url: string; type: string } | null>(null);
  const [variationResults, setVariationResults] = useState<VariationResult[]>([]);
  const [pollAbortSignal, setPollAbortSignal] = useState<AbortController | null>(null);
  
  // File upload states
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [imageStorageObjectId, setImageStorageObjectId] = useState('');
  const [audioStorageObjectId, setAudioStorageObjectId] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceFile[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<ReferenceFile[]>([]);
  const [referenceAudio, setReferenceAudio] = useState<ReferenceFile[]>([]);
  const [firstFrame, setFirstFrame] = useState<ReferenceFile | null>(null);
  const [lastFrame, setLastFrame] = useState<ReferenceFile | null>(null);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const appliedAssetDeepLink = useRef('');

  const workflows = [
    { id: 'text-to-video', name: 'Text-to-Video', icon: '📝' },
    { id: 'image-to-video', name: 'Image-to-Video', icon: '🖼️' },
    { id: 'lip-sync', name: 'Lip Sync / Talking Avatar', icon: '🗣️' },
    { id: 'text-to-image', name: 'Image Generation', icon: '🎨' },
    { id: 'multimodal-video', name: 'Seedance Studio', icon: '🎞️' },
    { id: 'video-edit', name: 'Kling Video Edit', icon: '🎭' },
    { id: 'video-enhance', name: 'Video Enhance', icon: '✨' },
    { id: 'image-upscale', name: 'Image Upscale', icon: '🔎' },
    { id: 'video-caption', name: 'Social Captions', icon: '💬' },
    { id: 'social-resize', name: 'Social Resize', icon: '📱' },
  ];

  const workflowModels = getModelsForWorkflow(workflow);
  const activeModelDefinition = getModelDefinition(model);

  const isSeedance = workflow === 'multimodal-video';
  const isKlingEdit = workflow === 'video-edit';
  const isVideoEnhance = workflow === 'video-enhance';
  const isImageUpscale = workflow === 'image-upscale';
  const isVideoCaption = workflow === 'video-caption';
  const isSocialResize = workflow === 'social-resize';
  const isPrunaAvatar = workflow === 'lip-sync' && model === 'prunaai/p-video-avatar';
  const isNanoBanana = activeModelDefinition?.family === 'nano-banana';
  const isRecraft = activeModelDefinition?.family === 'recraft';
  const isGrokImagineVideo = activeModelDefinition?.family === 'grok-video';
  const supportsCinematicControls = activeModelDefinition?.supportsCinematic === true;

  const loadLibraryAssets = useCallback(async () => {
    if (!token) {
      setLibraryAssets([]);
      return;
    }
    setLibraryLoading(true);
    try {
      const assets = await api.getAssets();
      setLibraryAssets(assets.filter((asset: LibraryAsset) => asset.storageObjectId));
    } catch (error) {
      console.error('Failed to load reusable assets:', error);
    } finally {
      setLibraryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setProjects([]);
      setSelectedProjectId('');
      return;
    }

    void api.getProjects()
      .then((data) => setProjects(data.map((project: any) => ({ id: project.id, name: project.name }))))
      .catch((error) => console.error('Failed to load projects:', error));
    void loadLibraryAssets();
  }, [token, loadLibraryAssets]);

  useEffect(() => {
    if (!token) return;
    const query = new URLSearchParams(window.location.search);
    const projectId = query.get('project_id');
    const sceneId = query.get('scene_id');
    if (!projectId || !sceneId) return;

    void api.getProject(projectId).then((project) => {
      const scene = project.scenes?.find((item: any) => item.id === sceneId);
      if (!scene) return;
      const assignedKits = (project.kitAssignments || []).map((assignment: any) => assignment.brandKit);
      const kitReferenceEntries = assignedKits
        .flatMap((kit: any) => (kit.kitAssets || []).map(({ asset }: any) => ({ kit, asset })))
        .filter(({ asset }: any) => asset.type === 'image' && asset.storageObjectId)
        .filter(({ asset }: any, index: number, all: any[]) => all.findIndex((item) => item.asset.storageObjectId === asset.storageObjectId) === index)
        .slice(0, 9);
      const kitReferences: ReferenceFile[] = kitReferenceEntries
        .map(({ kit, asset }: any) => ({ name: `${kit.name} reference`, id: asset.storageObjectId, url: asset.thumbnailUrl || asset.url, kind: 'image' as const }));
      const kitGuidance = assignedKits.map((kit: any) => {
        const details = [kit.description, kit.promptRules, kit.voice ? `Voice/tone: ${kit.voice}` : '', Array.isArray(kit.colors) && kit.colors.length ? `Colors: ${kit.colors.join(', ')}` : '', Array.isArray(kit.fonts) && kit.fonts.length ? `Fonts: ${kit.fonts.join(', ')}` : ''].filter(Boolean).join(' ');
        const imageTags = kitReferenceEntries.map((entry: any, index: number) => entry.kit.id === kit.id ? `[Image${index + 1}]` : '').filter(Boolean);
        return `${kit.kind === 'character' ? 'Character' : 'Brand'} ${kit.name}: ${details}${imageTags.length ? ` Use ${imageTags.join(' and ')} as identity references.` : ''}`;
      }).filter(Boolean);
      setSelectedProjectId(projectId);
      setSelectedSceneId(sceneId);
      setPrompt([scene.prompt || '', kitGuidance.length ? `Project continuity rules:\n${kitGuidance.join('\n')}` : ''].filter(Boolean).join('\n\n'));
      if (scene.durationSeconds) setDuration(scene.durationSeconds);
      if (kitReferences.length) {
        setReferenceImages(kitReferences);
        setWorkflow('multimodal-video');
        setModel('bytedance/seedance-2.0');
      } else {
        setWorkflow('text-to-video');
        setModel('alibaba/happyhorse-1.1');
      }
    }).catch((error) => setGenerationError(error.message || 'Failed to load storyboard scene'));
  }, [token]);

  useEffect(() => {
    if (!token || (!isVideoEnhance && !isImageUpscale && !isVideoCaption && !isSocialResize)) return;
    const sourceId = isVideoEnhance || isVideoCaption || isSocialResize ? referenceVideos[0]?.id : imageStorageObjectId;
    if (!sourceId) {
      setEnhancementQuote(null);
      setEnhancementQuoteError('');
      return;
    }
    setEnhancementQuote(null);
    setEnhancementQuoteError('');
    const timer = window.setTimeout(() => {
      const params = {
        duration: model === 'xai/grok-imagine-video-extension' ? extensionDuration : undefined,
        target_resolution: enhanceTargetResolution,
        target_fps: enhanceTargetFps,
        target: upscaleTargetMp,
        upscale_factor: model === 'google/upscaler' ? `x${upscaleFactor}` : undefined,
        scale_factor: Number(upscaleFactor),
        format: resizeFormat,
        mode: resizeMode,
      };
      void api.quoteGeneration({
        workflow,
        model,
        video_storage_object_id: isVideoEnhance || isVideoCaption || isSocialResize ? sourceId : undefined,
        image_storage_object_id: isImageUpscale ? sourceId : undefined,
        params,
      }).then((quote) => setEnhancementQuote(quote.credits))
        .catch((error) => setEnhancementQuoteError(error.message || 'Could not calculate exact credit quote'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [token, workflow, model, isVideoEnhance, isImageUpscale, isVideoCaption, isSocialResize, referenceVideos, imageStorageObjectId, extensionDuration, enhanceTargetResolution, enhanceTargetFps, upscaleTargetMp, upscaleFactor, resizeFormat, resizeMode]);

  const getBaseCredits = () => {
    if (isSocialResize) return 0;
    if (isVideoCaption) return 4;
    if (isImageUpscale) {
      if (model === 'google/upscaler') return 1;
      if (model === 'prunaai/p-image-upscale') return upscaleTargetMp <= 8 ? 1 : upscaleTargetMp <= 16 ? 1 : upscaleTargetMp <= 32 ? 2 : upscaleTargetMp <= 64 ? 2 : 4;
      return upscaleFactor === '4' ? 12 : 4;
    }
    if (isVideoEnhance) {
      const seconds = referenceVideoDuration || 5;
      if (model === 'xai/grok-imagine-video-extension') return Math.ceil((seconds + extensionDuration) * 0.05 * 31.25);
      if (model === 'topazlabs/video-upscale') {
        const costPerSecond = enhanceTargetResolution === '4k' ? 0.0746 : enhanceTargetResolution === '720p' ? 0.0054 : 0.0186;
        return Math.max(1, Math.ceil(seconds * costPerSecond * (enhanceTargetFps > 30 ? 2 : 1) * 31.25));
      }
      return Math.max(1, Math.ceil(seconds * (upscaleFactor === '4' ? 0.829 : upscaleFactor === '3' ? 0.6 : 0.4) * 31.25));
    }
    if (model === 'google/nano-banana-pro') return imageResolution === '4K' ? 6 : 3;
    if (model === 'google/nano-banana-2') return imageResolution === '4K' ? 2 : 1;
    if (workflow === 'text-to-image') return 1;
    const effectiveDuration = duration === -1 ? 15 : duration;
    if (model === 'kwaivgi/kling-v3-omni-video') {
      return Math.ceil(referenceVideoDuration || effectiveDuration) * (klingMode === 'standard' ? 5 : 7);
    }
    if (model === 'xai/grok-imagine-video-1.5') return Math.ceil(effectiveDuration) * 2;
    const durationBlocks = Math.max(1, Math.ceil(effectiveDuration / 5));
    if (model === 'bytedance/seedance-2.0-mini') return 2 * durationBlocks;
    if (model === 'bytedance/seedance-2.0-fast') return 3 * durationBlocks;
    if (model === 'bytedance/seedance-2.0') return 4 * durationBlocks;
    if (workflow.includes('video') || workflow === 'lip-sync') return 3 * durationBlocks;
    return 1;
  };

  const baseCredits = getBaseCredits();
  const variationUnitCredits = model === 'google/nano-banana-pro' ? baseCredits : Math.ceil(baseCredits * 0.75);
  const totalCredits = baseCredits + Math.max(0, variations - 1) * variationUnitCredits;
  const displayedCredits = isVideoEnhance || isImageUpscale || isVideoCaption || isSocialResize ? enhancementQuote : totalCredits;
  const dynamicControlValues: Partial<Record<ControlKey, string | number | boolean>> = {
    target_resolution: enhanceTargetResolution,
    target_fps: enhanceTargetFps,
    scale_factor: Number(upscaleFactor),
    extension_duration: extensionDuration,
    target_megapixels: upscaleTargetMp,
    enhance_details: enhanceDetails,
    enhance_realism: enhanceRealism,
    upscale_factor: Number(upscaleFactor),
    quality: upscaleQuality,
    creativity: upscaleCreativity,
    output_format: imageOutputFormat,
  };
  const updateDynamicControl = (key: ControlKey, value: string | number | boolean) => {
    if (key === 'target_resolution') setEnhanceTargetResolution(String(value));
    if (key === 'target_fps') setEnhanceTargetFps(Number(value));
    if (key === 'scale_factor' || key === 'upscale_factor') setUpscaleFactor(String(value));
    if (key === 'extension_duration') setExtensionDuration(Number(value));
    if (key === 'target_megapixels') setUpscaleTargetMp(Number(value));
    if (key === 'enhance_details') setEnhanceDetails(Boolean(value));
    if (key === 'enhance_realism') setEnhanceRealism(Boolean(value));
    if (key === 'quality') setUpscaleQuality(Number(value));
    if (key === 'creativity') setUpscaleCreativity(Number(value));
    if (key === 'output_format') setImageOutputFormat(String(value));
  };
  const applyModelControlDefaults = (modelId: string) => {
    getModelDefinition(modelId)?.controls?.forEach((control) => updateDynamicControl(control.key, control.defaultValue));
  };

  const uploadReferenceFiles = async (
    files: FileList | null,
    maximum: number,
    kind: 'image' | 'video' | 'audio'
  ) => {
    if (!files) return [];
    const selected = Array.from(files);
    if (selected.length > maximum) {
      throw new Error(`You can upload at most ${maximum} ${kind} files.`);
    }

    const maximumSize = kind === 'image' ? 10 * 1024 * 1024 : kind === 'audio' ? 50 * 1024 * 1024 : 200 * 1024 * 1024;
    if (selected.some((file) => file.size > maximumSize)) {
      throw new Error(`${kind === 'image' ? 'Images' : 'Video and audio files'} must be smaller than ${maximumSize / 1024 / 1024}MB each.`);
    }

    setUploadProgress(0);
    try {
      const uploadedReferences = await Promise.all(selected.map(async (file) => {
        const uploaded = await api.uploadFile(file, 'seedance-reference', setUploadProgress);
        return { name: file.name, id: uploaded.id, url: uploaded.url, kind } as ReferenceFile;
      }));
      void loadLibraryAssets();
      return uploadedReferences;
    } finally {
      setUploadProgress(null);
    }
  };

  const handleReferenceUpload = async (
    files: FileList | null,
    kind: 'image' | 'video' | 'audio'
  ) => {
    try {
      setGenerationError('');
      const references = await uploadReferenceFiles(files, kind === 'image' ? 9 : 3, kind);

      if (kind === 'image') setReferenceImages(references);
      if (kind === 'video') setReferenceVideos(references);
      if (kind === 'audio') setReferenceAudio(references);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Failed to load reference files');
    }
  };

  const handleFrameUpload = async (files: FileList | null, position: 'first' | 'last') => {
    try {
      setGenerationError('');
      const [frame] = await uploadReferenceFiles(files, 1, 'image');
      if (position === 'first') setFirstFrame(frame || null);
      if (position === 'last') setLastFrame(frame || null);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Failed to load frame image');
    }
  };

  const handleEnhancePrompt = () => {
    if (!prompt) return;
    setPrompt(
      `${prompt}, cinematic lighting, photorealistic, 8k resolution, shot on 35mm lens, highly detailed textures, vibrant depth of field`
    );
  };

  const readVideoDuration = (file: File) => new Promise<number>((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const measured = video.duration;
      URL.revokeObjectURL(objectUrl);
      Number.isFinite(measured) ? resolve(measured) : reject(new Error('Could not read video duration'));
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read video metadata'));
    };
    video.src = objectUrl;
  });

  const handleCharacterImageUpload = async (files: FileList | null) => {
    try {
      setGenerationError('');
      setReferenceImages(await uploadReferenceFiles(files, 4, 'image'));
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Edit reference upload failed');
    }
  };

  const handleCharacterVideoUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setGenerationError('');
      const measured = await readVideoDuration(file);
      if (measured < KLING_REFERENCE_MIN_SECONDS || measured >= KLING_REFERENCE_MAX_SECONDS) {
        throw new Error(`Reference video must be at least 3 seconds and no more than 9.8 seconds to avoid Kling's 10-second provider limit. This video is ${measured.toFixed(2)} seconds.`);
      }
      setReferenceVideoDuration(measured);
      setReferenceVideos(await uploadReferenceFiles(files, 1, 'video'));
    } catch (error) {
      setReferenceVideos([]);
      setReferenceVideoDuration(null);
      setGenerationError(error instanceof Error ? error.message : 'Reference video upload failed');
    }
  };

  const handleEnhanceVideoUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setGenerationError('');
      const measured = await readVideoDuration(file);
      if (model === 'xai/grok-imagine-video-extension' && (measured < 2 || measured > 15.05)) {
        throw new Error(`Grok source video must be between 2 and 15 seconds. This video is ${measured.toFixed(1)} seconds.`);
      }
      if (measured > 120) throw new Error('Video enhancement currently supports source videos up to 120 seconds.');
      setReferenceVideoDuration(measured);
      setReferenceVideos(await uploadReferenceFiles(files, 1, 'video'));
    } catch (error) {
      setReferenceVideos([]);
      setReferenceVideoDuration(null);
      setGenerationError(error instanceof Error ? error.message : 'Enhancement video upload failed');
    }
  };

  const handleCaptionVideoUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setGenerationError('');
      const measured = await readVideoDuration(file);
      if (measured > 60.05) throw new Error(`Caption clips are limited to 60 seconds. This video is ${measured.toFixed(1)} seconds.`);
      setReferenceVideoDuration(measured);
      setReferenceVideos(await uploadReferenceFiles(files, 1, 'video'));
    } catch (error) {
      setReferenceVideos([]);
      setReferenceVideoDuration(null);
      setGenerationError(error instanceof Error ? error.message : 'Caption video upload failed');
    }
  };

  const handleSocialResizeVideoUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setGenerationError('');
      const measured = await readVideoDuration(file);
      if (measured > 180.05) throw new Error(`Social resize clips are limited to 180 seconds. This video is ${measured.toFixed(1)} seconds.`);
      setReferenceVideoDuration(measured);
      setReferenceVideos(await uploadReferenceFiles(files, 1, 'video'));
    } catch (error) {
      setReferenceVideos([]);
      setReferenceVideoDuration(null);
      setGenerationError(error instanceof Error ? error.message : 'Social resize video upload failed');
    }
  };

  const handleQuickCreateProject = async () => {
    if (!quickProjectName.trim()) return;
    try {
      const project = await api.createProject({ name: quickProjectName.trim() });
      setProjects((current) => [{ id: project.id, name: project.name }, ...current]);
      setSelectedProjectId(project.id);
      setQuickProjectName('');
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to create project');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setGenerationError('Image must be smaller than 10MB');
        input.value = '';
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setUploadProgress(0);
      try {
        const uploaded = await api.uploadFile(file, 'generation-input', setUploadProgress);
        setImageStorageObjectId(uploaded.id);
        void loadLibraryAssets();
      } catch (error) {
        setImageFile(null);
        setImageStorageObjectId('');
        setGenerationError(error instanceof Error ? error.message : 'Image upload failed');
      } finally {
        setUploadProgress(null);
        input.value = '';
      }
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) { // 50MB limit for audio
        setGenerationError('Audio file must be smaller than 50MB');
        input.value = '';
        return;
      }
      setAudioFile(file);
      setAudioFileName(file.name);
      setUploadProgress(0);
      try {
        const uploaded = await api.uploadFile(file, 'lip-sync-audio', setUploadProgress);
        setAudioStorageObjectId(uploaded.id);
        void loadLibraryAssets();
      } catch (error) {
        setAudioFile(null);
        setAudioStorageObjectId('');
        setGenerationError(error instanceof Error ? error.message : 'Audio upload failed');
      } finally {
        setUploadProgress(null);
        input.value = '';
      }
    }
  };

  const supportedLibraryTypes: Array<'image' | 'video' | 'audio'> =
    workflow === 'image-to-video' || isImageUpscale || (workflow === 'text-to-image' && isNanoBanana)
      ? ['image']
      : workflow === 'lip-sync'
        ? ['image', 'audio']
        : isKlingEdit || isVideoEnhance || isVideoCaption || isSocialResize
          ? ['image', 'video']
          : isSeedance
            ? ['image', 'video', 'audio']
            : [];
  const compatibleLibraryAssets = libraryAssets
    .filter((asset) => supportedLibraryTypes.includes(asset.type) && asset.storageObjectId)
    .slice(0, 12);

  const isLibraryAssetSelected = (asset: LibraryAsset) => {
    const storageId = asset.storageObjectId || '';
    if (workflow === 'image-to-video') return imageStorageObjectId === storageId;
    if (isImageUpscale) return imageStorageObjectId === storageId;
    if (isVideoCaption || isSocialResize) return asset.type === 'video' && referenceVideos[0]?.id === storageId;
    if (workflow === 'lip-sync') return asset.type === 'image' ? imageStorageObjectId === storageId : audioStorageObjectId === storageId;
    if (asset.type === 'image') return referenceImages.some((item) => item.id === storageId);
    if (asset.type === 'video') return referenceVideos.some((item) => item.id === storageId);
    return referenceAudio.some((item) => item.id === storageId);
  };

  const selectLibraryAsset = (asset: LibraryAsset) => {
    if (!asset.storageObjectId) return;
    const reference: ReferenceFile = {
      id: asset.storageObjectId,
      url: asset.url,
      kind: asset.type,
      name: asset.prediction?.prompt?.slice(0, 48) || `Library ${asset.type}`,
    };
    if (isVideoCaption || isSocialResize) {
      if (asset.type === 'video') {
        setReferenceVideos([reference]);
        setReferenceVideoDuration(null);
      }
      return;
    }

    if (workflow === 'image-to-video' || isImageUpscale) {
      setImageFile(null);
      setImagePreview(asset.thumbnailUrl || asset.url);
      setImageStorageObjectId(asset.storageObjectId);
      return;
    }
    if (workflow === 'lip-sync') {
      if (asset.type === 'image') {
        setImageFile(null);
        setImagePreview(asset.thumbnailUrl || asset.url);
        setImageStorageObjectId(asset.storageObjectId);
      } else if (asset.type === 'audio') {
        setAudioFile(null);
        setAudioFileName(reference.name);
        setAudioStorageObjectId(asset.storageObjectId);
      }
      return;
    }
    if (isKlingEdit) {
      if (asset.type === 'image') {
        const exists = referenceImages.some((item) => item.id === reference.id);
        setReferenceImages(exists ? referenceImages.filter((item) => item.id !== reference.id) : [...referenceImages, reference].slice(0, 4));
      }
      if (asset.type === 'video') {
        setReferenceVideos([reference]);
        setReferenceVideoDuration(null);
      }
      return;
    }
    if (isVideoEnhance && asset.type === 'video') {
      setReferenceVideos([reference]);
      setReferenceVideoDuration(null);
      return;
    }

    const toggleReference = (
      current: ReferenceFile[],
      setCurrent: (items: ReferenceFile[]) => void,
      maximum: number
    ) => {
      const exists = current.some((item) => item.id === reference.id);
      setCurrent(exists ? current.filter((item) => item.id !== reference.id) : [...current, reference].slice(0, maximum));
    };
    if (asset.type === 'image') toggleReference(referenceImages, setReferenceImages, isNanoBanana ? 14 : 9);
    if (asset.type === 'video') toggleReference(referenceVideos, setReferenceVideos, 3);
    if (asset.type === 'audio') toggleReference(referenceAudio, setReferenceAudio, 3);
  };

  useEffect(() => {
    if (!token || !libraryAssets.length) return;
    const query = new URLSearchParams(window.location.search);
    const requestedWorkflow = query.get('workflow');
    const assetId = query.get('asset_id');
    if (!requestedWorkflow || !assetId) return;
    const signature = `${requestedWorkflow}:${assetId}:${query.get('model') || ''}`;
    if (appliedAssetDeepLink.current === signature) return;
    const asset = libraryAssets.find((item) => item.id === assetId && item.storageObjectId);
    const models = getModelsForWorkflow(requestedWorkflow);
    if (!asset || !models.length) return;
    const requestedModel = query.get('model');
    const nextModel = models.find((item) => item.id === requestedModel) || models[0];
    const reference: ReferenceFile = {
      id: asset.storageObjectId!, url: asset.url, kind: asset.type,
      name: asset.prediction?.prompt?.slice(0, 48) || `Library ${asset.type}`,
    };

    setWorkflow(requestedWorkflow);
    setModel(nextModel.id);
    applyModelControlDefaults(nextModel.id);
    if (requestedWorkflow === 'image-to-video' || requestedWorkflow === 'image-upscale') {
      if (asset.type !== 'image') return;
      setImageFile(null);
      setImagePreview(asset.thumbnailUrl || asset.url);
      setImageStorageObjectId(asset.storageObjectId!);
    } else if (requestedWorkflow === 'video-edit') {
      if (asset.type === 'image') setReferenceImages([reference]);
      if (asset.type === 'video') setReferenceVideos([reference]);
    } else if (requestedWorkflow === 'video-enhance' && asset.type === 'video') {
      setReferenceVideos([reference]);
      setReferenceVideoDuration(null);
      if (nextModel.id === 'xai/grok-imagine-video-extension') setPrompt('Continue the scene naturally from the final frame.');
    } else if ((requestedWorkflow === 'video-caption' || requestedWorkflow === 'social-resize') && asset.type === 'video') {
      setReferenceVideos([reference]);
      setReferenceVideoDuration(null);
    } else if (requestedWorkflow === 'text-to-image' && asset.type === 'image') {
      setReferenceImages([reference]);
    } else if (requestedWorkflow === 'lip-sync') {
      if (asset.type === 'image') {
        setImagePreview(asset.thumbnailUrl || asset.url);
        setImageStorageObjectId(asset.storageObjectId!);
      }
      if (asset.type === 'audio') {
        setAudioFileName(reference.name);
        setAudioStorageObjectId(asset.storageObjectId!);
      }
    }
    appliedAssetDeepLink.current = signature;
  }, [token, libraryAssets]);

  const pollPrediction = async (id: string, abortSignal: AbortController, variationIndex = 0) => {
    let attempts = 0;
    const maxAttempts = 120; // 4 minutes with 2s interval

    const poll = async () => {
      if (abortSignal.signal.aborted) return;
      
      attempts++;
      try {
        const data = await api.getPrediction(id);
        if (data.status === 'succeeded' && data.output_url) {
          const type = workflow === 'text-to-image' ? 'image' : 'video';
          setVariationResults((current) => current.map((item) =>
            item.id === id ? { ...item, status: 'succeeded', url: data.output_url, type } : item
          ));
          setGenerationProgress(100);
          setGenerationStatus('succeeded');
          setLastGeneratedAsset({
            id,
            url: data.output_url,
            type,
          });
          setTimeout(() => setIsGenerating(false), 1500);
          return;
        }
        if (data.status === 'failed') {
          setVariationResults((current) => current.map((item) =>
            item.id === id ? { ...item, status: 'failed' } : item
          ));
          setGenerationError(data.error || 'Generation failed');
          setGenerationStatus('failed');
          setTimeout(() => setIsGenerating(false), 2000);
          return;
        }
        // Still processing
        setGenerationProgress(Math.min(90, attempts * (90 / maxAttempts)));
        if (attempts < maxAttempts && !abortSignal.signal.aborted) {
          setTimeout(poll, 2000);
        } else if (attempts >= maxAttempts) {
          setGenerationStatus('failed');
          setGenerationError('Generation is taking longer than expected. Check the asset library shortly.');
          setIsGenerating(false);
        }
      } catch (err) {
        if (!abortSignal.signal.aborted) {
          console.error('Polling error:', err);
          setGenerationError('Failed to check prediction status');
          setIsGenerating(false);
        }
      }
    };

    poll();
  };

  const handleGenerate = async () => {
    if (!token) {
      setGenerationError('Please sign in to generate content.');
      return;
    }
    
    // Validate based on workflow
    if (workflow === 'text-to-video' || workflow === 'text-to-image' || workflow === 'multimodal-video' || workflow === 'video-edit') {
      if (!prompt) {
        setGenerationError('Please enter a prompt.');
        return;
      }
    } else if (workflow === 'image-to-video') {
      if (!imageStorageObjectId) {
        setGenerationError('Please upload an image.');
        return;
      }
      if (isGrokImagineVideo && !prompt.trim()) {
        setGenerationError('Please describe the motion or scene for Grok Imagine Video.');
        return;
      }
    } else if (workflow === 'lip-sync') {
      if (!imageStorageObjectId || !audioStorageObjectId) {
        setGenerationError('Please upload both image and audio files.');
        return;
      }
    } else if (isImageUpscale && !imageStorageObjectId) {
      setGenerationError('Please upload or select an image to upscale.');
      return;
    } else if (isVideoEnhance) {
      if (!referenceVideos[0]) {
        setGenerationError('Please upload or select a source video.');
        return;
      }
      if (model === 'xai/grok-imagine-video-extension' && !prompt.trim()) {
        setGenerationError('Please describe what should happen next in the video.');
        return;
      }
    } else if (isSocialResize) {
      if (!referenceVideos[0]) {
        setGenerationError('Please upload or select a source video.');
        return;
      }
    }
    if (workflow === 'video-edit' && !referenceVideos[0]) {
      setGenerationError('Please upload a source video that is at least 3 seconds and safely under 10 seconds. Reference images are optional unless your prompt uses one.');
      return;
    }
    if ((isVideoEnhance || isImageUpscale || isSocialResize) && enhancementQuote === null) {
      setGenerationError(enhancementQuoteError || 'Please wait for the exact credit quote before submitting.');
      return;
    }

    // Abort previous polling if still active
    if (pollAbortSignal) {
      pollAbortSignal.abort();
    }

    const abortController = new AbortController();
    setPollAbortSignal(abortController);

    setIsGenerating(true);
    setGenerationProgress(5);
    setGenerationStatus('submitting');
    setGenerationError('');
    setLastGeneratedAsset(null);
    setVariationResults([]);

    try {
      const submittedPrompt = supportsCinematicControls
        ? buildCinematicPrompt(prompt, cinematicSettings)
        : prompt;
      const generatePayload: any = {
        workflow,
        model,
        prompt: submittedPrompt,
        project_id: selectedProjectId || undefined,
        storyboard_scene_id: selectedSceneId || undefined,
        params: {
          duration,
          fps,
          camera_move: cameraMove,
          motion_strength: motionStrength,
          resolution,
          aspect_ratio: aspectRatio,
          generate_audio: generateAudio,
          seed: seed === '' ? undefined : Number(seed),
          variations,
        },
      };

      if (workflow === 'text-to-image') {
        generatePayload.params.resolution = isNanoBanana ? imageResolution : undefined;
        generatePayload.params.output_format = isNanoBanana ? imageOutputFormat : undefined;
        generatePayload.params.style = isRecraft ? recraftStyle : undefined;
        generatePayload.params.reference_image_ids = isNanoBanana ? referenceImages.map((file) => file.id) : undefined;
      }

      if (isSeedance) {
        generatePayload.params.reference_image_ids = referenceImages.map((file) => file.id);
        generatePayload.params.reference_video_ids = referenceVideos.map((file) => file.id);
        generatePayload.params.reference_audio_ids = referenceAudio.map((file) => file.id);
        generatePayload.params.first_frame_image_id = firstFrame?.id;
        generatePayload.params.last_frame_image_id = lastFrame?.id;
      } else if (isKlingEdit) {
        generatePayload.params.reference_image_ids = referenceImages.slice(0, 4).map((file) => file.id);
        generatePayload.params.reference_video_id = referenceVideos[0]?.id;
        generatePayload.params.mode = klingMode;
        generatePayload.params.keep_original_sound = keepOriginalSound;
        generatePayload.params.generate_audio = false;
        generatePayload.params.duration = referenceVideoDuration || undefined;
      }

      // Add file data if needed
      if (imageStorageObjectId && workflow === 'image-to-video') {
        generatePayload.image_storage_object_id = imageStorageObjectId;
      } else if (isImageUpscale && imageStorageObjectId) {
        generatePayload.image_storage_object_id = imageStorageObjectId;
        generatePayload.params = {
          ...generatePayload.params,
          target: upscaleTargetMp,
          upscale_factor: model === 'google/upscaler' ? `x${upscaleFactor}` : undefined,
          scale_factor: model === 'philz1337x/clarity-pro-upscaler' ? Number(upscaleFactor) : undefined,
          compression_quality: upscaleQuality,
          output_quality: upscaleQuality,
          output_format: imageOutputFormat,
          creativity: upscaleCreativity,
          enhance_details: enhanceDetails,
          enhance_realism: enhanceRealism,
        };
      } else if (isVideoEnhance && referenceVideos[0]) {
        generatePayload.video_storage_object_id = referenceVideos[0].id;
        generatePayload.params = {
          ...generatePayload.params,
          duration: model === 'xai/grok-imagine-video-extension' ? extensionDuration : undefined,
          target_resolution: enhanceTargetResolution,
          target_fps: enhanceTargetFps,
          scale_factor: Number(upscaleFactor),
        };
      } else if (isVideoCaption && referenceVideos[0]) {
        generatePayload.video_storage_object_id = referenceVideos[0].id;
        generatePayload.params = {
          subs_position: captionPosition,
          color: captionColor,
          highlight_color: captionHighlightColor,
          fontsize: captionFontSize,
          MaxChars: captionMaxChars,
          opacity: captionOpacity,
          font: captionFont,
          stroke_color: captionStrokeColor,
          stroke_width: captionStrokeWidth,
          kerning: captionKerning,
          right_to_left: captionRightToLeft,
          translate: captionTranslate,
          variations: 1,
        };
      } else if (isSocialResize && referenceVideos[0]) {
        generatePayload.video_storage_object_id = referenceVideos[0].id;
        generatePayload.params = {
          format: resizeFormat,
          mode: resizeMode,
          variations: 1,
        };
      } else if (workflow === 'lip-sync' && imageStorageObjectId && audioStorageObjectId) {
        generatePayload.image_storage_object_id = imageStorageObjectId;
        generatePayload.audio_storage_object_id = audioStorageObjectId;
      }

      const data = await api.generate(generatePayload);
      const resultType = workflow.includes('image') && workflow !== 'image-to-video' ? 'image' : 'video';
      const returnedPredictions = Array.isArray(data.predictions) ? data.predictions : [{
        id: data.id,
        status: data.status,
        output_url: data.output_url,
        variation_index: 0,
      }];

      setVariationResults(returnedPredictions.map((prediction: any) => ({
        id: prediction.id,
        status: prediction.status,
        url: prediction.output_url,
        variationIndex: prediction.variation_index ?? 0,
        type: resultType,
      })));

      setGenerationProgress(15);
      setGenerationStatus('processing');

      if (data.status === 'succeeded' && data.output_url) {
        setGenerationProgress(100);
        setGenerationStatus('succeeded');
        setLastGeneratedAsset({
          id: data.id,
          url: data.output_url,
          type: workflow.includes('image') && workflow !== 'image-to-video' ? 'image' : 'video'
        });
        setTimeout(() => setIsGenerating(false), 1500);
      } else {
        await Promise.all(returnedPredictions.map((prediction: any) =>
          pollPrediction(prediction.id, abortController, prediction.variation_index ?? 0)
        ));
      }
    } catch (err: any) {
      setGenerationError(err.message || 'Generation request failed');
      setIsGenerating(false);
    }
  };

  // Cleanup abort signal on unmount
  useEffect(() => {
    return () => {
      if (pollAbortSignal) {
        pollAbortSignal.abort();
      }
    };
  }, [pollAbortSignal]);

  return (
    <div className="studio-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', height: '100%' }}>

      {/* Studio Workbench (Left Column) */}
      <div className="studio-workbench" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

        {/* Workflow Tabs */}
        <div className="workflow-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1rem', flexWrap: 'wrap' }}>
          {workflows.map((wf) => {
            const isActive = workflow === wf.id;
            return (
              <button
                key={wf.id}
                onClick={() => {
                  setWorkflow(wf.id);
                  const firstModel = getModelsForWorkflow(wf.id)[0];
                  setModel(firstModel.id);
                  applyModelControlDefaults(firstModel.id);
                  setDuration(wf.id === 'multimodal-video' ? -1 : 5);
                  setResolution('720p');
                  setImageResolution('1K');
                  setImageOutputFormat('jpg');
                  setRecraftStyle('any');
                  setAspectRatio(wf.id === 'multimodal-video' ? 'adaptive' : wf.id === 'image-to-video' ? 'auto' : '16:9');
                  if (wf.id === 'video-edit') {
                    setKlingEditPreset('custom');
                    setPrompt('');
                    setGenerateAudio(false);
                    setReferenceImages([]);
                    setReferenceVideos([]);
                    setReferenceVideoDuration(null);
                  }
                  if (wf.id === 'video-enhance') {
                    setVariations(1);
                    setPrompt('');
                    setReferenceVideos([]);
                    setReferenceVideoDuration(null);
                  }
                  if (wf.id === 'image-upscale') {
                    setVariations(1);
                    setPrompt('');
                    setImageStorageObjectId('');
                    setImagePreview('');
                    setImageFile(null);
                  }
                  if (wf.id === 'video-caption') {
                    setVariations(1);
                    setPrompt('');
                    setReferenceVideos([]);
                    setReferenceVideoDuration(null);
                    setCaptionPreset('social');
                    setCaptionFontSize(4);
                    setCaptionMaxChars(10);
                  }
                  if (wf.id === 'social-resize') {
                    setVariations(1);
                    setPrompt('');
                    setReferenceVideos([]);
                    setReferenceVideoDuration(null);
                    setResizeFormat('vertical');
                    setResizeMode('crop');
                  }
                }}
                className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '12px', fontSize: '0.9rem', padding: '0.6rem 1.2rem' }}
              >
                <span>{wf.icon}</span> {wf.name}
              </button>
            );
          })}
        </div>

        {supportedLibraryTypes.length > 0 && (
          <section className="glass-card asset-picker" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Choose from your asset library</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
                  Reuse an existing {supportedLibraryTypes.join(', ')} file or upload a new one below.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => void loadLibraryAssets()} disabled={libraryLoading} style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
                  {libraryLoading ? 'Loading…' : 'Refresh'}
                </button>
                <a href="/library" className="btn btn-secondary" style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>Open library</a>
              </div>
            </div>
            {compatibleLibraryAssets.length > 0 ? (
              <div className="asset-picker-grid">
                {compatibleLibraryAssets.map((asset) => {
                  const selected = isLibraryAssetSelected(asset);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`asset-picker-card ${selected ? 'selected' : ''}`}
                      onClick={() => selectLibraryAsset(asset)}
                      title={asset.prediction?.prompt || `Uploaded ${asset.type}`}
                    >
                      <span className="asset-picker-preview">
                        {asset.type === 'image' ? (
                          <img src={asset.thumbnailUrl || asset.url} alt="" />
                        ) : (
                          <span aria-hidden="true">{asset.type === 'video' ? '🎬' : '🎵'}</span>
                        )}
                      </span>
                      <span className="asset-picker-label">
                        {asset.prediction?.prompt?.slice(0, 30) || `Uploaded ${asset.type}`}
                      </span>
                      <small>{selected ? 'Selected' : asset.type}</small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                {libraryLoading ? 'Loading reusable assets…' : 'No compatible assets yet. Upload one below and it will appear here automatically.'}
              </p>
            )}
          </section>
        )}

        {/* Prompt Input & Assist */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {(workflow === 'image-to-video' || isImageUpscale) && (
            <>
              <div className="prompt-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>1. {isImageUpscale ? 'Choose an image to upscale' : 'Upload reference image'}</h3>
              </div>
              <div
                style={{
                  border: '2px dashed var(--panel-border)',
                  borderRadius: '12px',
                  padding: '2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: imagePreview ? 'rgba(139, 92, 246, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  id="image-upload"
                />
                <label htmlFor="image-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" style={{ maxHeight: '150px', borderRadius: '8px' }} />
                      <span style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>✓ Image selected: {imageFile?.name || 'Library image'}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '2rem' }}>🖼️</span>
                      <span>Click to upload image (JPG, PNG, WebP - max 10MB)</span>
                    </>
                  )}
                </label>
              </div>
            </>
          )}

          {workflow === 'lip-sync' && (
            <>
              <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>1. Upload portrait image</h3>
                  <div
                    style={{
                      border: '2px dashed var(--panel-border)',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: imagePreview ? 'rgba(139, 92, 246, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                      id="lip-sync-image"
                    />
                    <label htmlFor="lip-sync-image" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {imagePreview ? (
                        <>
                          <img src={imagePreview} alt="Preview" style={{ maxHeight: '120px', borderRadius: '8px' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>✓ {imageFile?.name || 'Library image'}</span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: '1.5rem' }}>📸</span>
                          <span style={{ fontSize: '0.85rem' }}>Click to upload portrait (clear face)</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>2. Upload audio file</h3>
                  <div
                    style={{
                      border: '2px dashed var(--panel-border)',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: audioStorageObjectId ? 'rgba(139, 92, 246, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioUpload}
                      style={{ display: 'none' }}
                      id="audio-upload"
                    />
                    <label htmlFor="audio-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {audioStorageObjectId ? (
                        <>
                          <span style={{ fontSize: '1.5rem' }}>🎵</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>✓ {audioFileName}</span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: '1.5rem' }}>🎙️</span>
                          <span style={{ fontSize: '0.85rem' }}>Click to upload audio (MP3, WAV)</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}

          {isKlingEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>1. Choose an edit</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                  Start from a safe prompt template, then customize the exact subject, object, setting, lighting, weather, or style you want changed.
                </p>
              </div>
              <select
                className="form-select"
                value={klingEditPreset}
                onChange={(event) => {
                  const preset = KLING_EDIT_PRESETS.find((item) => item.id === event.target.value);
                  setKlingEditPreset(event.target.value);
                  if (preset) setPrompt(preset.prompt);
                }}
              >
                {KLING_EDIT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>

              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>2. Add reference images (optional)</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                  Add up to four references for people, products, clothing, backgrounds, or visual style. Refer to them as &lt;&lt;&lt;image_1&gt;&gt;&gt; through &lt;&lt;&lt;image_4&gt;&gt;&gt;.
                </p>
              </div>
              <label style={{ border: '2px dashed var(--panel-border)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', background: referenceImages.length ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)' }}>
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { const input = event.currentTarget; const files = input.files; void handleCharacterImageUpload(files).finally(() => { input.value = ''; }); }} style={{ display: 'none' }} />
                <strong style={{ display: 'block' }}>{referenceImages.length ? referenceImages.map((image) => image.name).join(', ') : 'Choose up to four reference images'}</strong>
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>Maximum 10 MB each</span>
              </label>

              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>3. Upload the source video</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                  The video must be 3–10 seconds long. Longer videos are rejected before generation and no credits are charged.
                </p>
              </div>
              <label style={{ border: '2px dashed var(--panel-border)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', background: referenceVideos.length ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)' }}>
                <input type="file" accept="video/mp4,video/quicktime" onChange={(event) => { const input = event.currentTarget; const files = input.files; void handleCharacterVideoUpload(files).finally(() => { input.value = ''; }); }} style={{ display: 'none' }} />
                <strong style={{ display: 'block' }}>{referenceVideos[0]?.name || 'Choose 3–10 second video'}</strong>
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>
                  {referenceVideoDuration ? `${referenceVideoDuration.toFixed(1)} seconds` : 'Maximum 200 MB'}
                </span>
              </label>
            </div>
          )}

          {isVideoEnhance && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>1. Choose a source video</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                  Grok accepts 2–15 second MP4 files. Upscaling models accept longer videos, with credits based on actual duration, resolution, and frame rate.
                </p>
              </div>
              <label style={{ border: '2px dashed var(--panel-border)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', background: referenceVideos.length ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)' }}>
                <input type="file" accept={model === 'xai/grok-imagine-video-extension' ? 'video/mp4' : 'video/mp4,video/quicktime,video/webm'} onChange={(event) => { const input = event.currentTarget; const files = input.files; void handleEnhanceVideoUpload(files).finally(() => { input.value = ''; }); }} style={{ display: 'none' }} />
                <strong style={{ display: 'block' }}>{referenceVideos[0]?.name || 'Choose source video'}</strong>
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>
                  {referenceVideoDuration ? `${referenceVideoDuration.toFixed(1)} seconds` : 'Maximum 200 MB'}
                </span>
              </label>
            </div>
          )}

          {isVideoCaption && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>1. Choose a source video</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>Add styled, karaoke-style captions to a clip up to 60 seconds. The captioned video and editable transcript are saved to your Library.</p>
              </div>
              <label style={{ border: '2px dashed var(--panel-border)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', background: referenceVideos.length ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)' }}>
                <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => { const input = event.currentTarget; const files = input.files; void handleCaptionVideoUpload(files).finally(() => { input.value = ''; }); }} style={{ display: 'none' }} />
                <strong style={{ display: 'block' }}>{referenceVideos[0]?.name || 'Choose video to caption'}</strong>
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>{referenceVideoDuration ? `${referenceVideoDuration.toFixed(1)} seconds` : 'Maximum 60 seconds / 200 MB'}</span>
              </label>

              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>2. Caption style</h3>
                <div className="caption-control-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.85rem' }}>
                  <div><label className="form-label">Format preset</label><select aria-label="Caption preset" className="form-select" value={captionPreset} onChange={(event) => {
                    const preset = event.target.value as 'social' | 'landscape';
                    setCaptionPreset(preset);
                    setCaptionFontSize(preset === 'social' ? 4 : 7);
                    setCaptionMaxChars(preset === 'social' ? 10 : 20);
                  }}><option value="social">Reels / Shorts</option><option value="landscape">Landscape video</option></select></div>
                  <div><label className="form-label">Position</label><select aria-label="Caption position" className="form-select" value={captionPosition} onChange={(event) => setCaptionPosition(event.target.value)}><option value="bottom75">Lower third</option><option value="bottom">Bottom</option><option value="center">Center</option><option value="top">Top</option></select></div>
                  <div><label className="form-label">Font</label><select aria-label="Caption font" className="form-select" value={captionFont} onChange={(event) => setCaptionFont(event.target.value)}><option value="Poppins/Poppins-ExtraBold.ttf">Poppins Extra Bold</option><option value="Arial.ttf">Arial (RTL compatible)</option></select></div>
                  <div><label className="form-label">Font size ({captionFontSize})</label><input aria-label="Caption font size" className="form-range" type="range" min={2} max={12} step={0.5} value={captionFontSize} onChange={(event) => setCaptionFontSize(Number(event.target.value))} /></div>
                  <div><label className="form-label">Caption color</label><input aria-label="Caption color" className="form-input" value={captionColor} onChange={(event) => setCaptionColor(event.target.value)} placeholder="white or #ffffff" /></div>
                  <div><label className="form-label">Highlight color</label><input aria-label="Highlight color" className="form-input" value={captionHighlightColor} onChange={(event) => setCaptionHighlightColor(event.target.value)} placeholder="yellow or #ffff00" /></div>
                  <div><label className="form-label">Characters per caption ({captionMaxChars})</label><input aria-label="Characters per caption" className="form-range" type="range" min={5} max={40} step={1} value={captionMaxChars} onChange={(event) => setCaptionMaxChars(Number(event.target.value))} /></div>
                  <div><label className="form-label">Background opacity ({captionOpacity})</label><input aria-label="Caption background opacity" className="form-range" type="range" min={0} max={1} step={0.1} value={captionOpacity} onChange={(event) => setCaptionOpacity(Number(event.target.value))} /></div>
                </div>
                <details style={{ marginTop: '1rem' }}><summary style={{ cursor: 'pointer', color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>Advanced caption controls</summary>
                  <div className="caption-control-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.85rem', marginTop: '0.85rem' }}>
                    <div><label className="form-label">Stroke color</label><input aria-label="Stroke color" className="form-input" value={captionStrokeColor} onChange={(event) => setCaptionStrokeColor(event.target.value)} /></div>
                    <div><label className="form-label">Stroke width ({captionStrokeWidth})</label><input aria-label="Stroke width" className="form-range" type="range" min={0} max={8} step={0.1} value={captionStrokeWidth} onChange={(event) => setCaptionStrokeWidth(Number(event.target.value))} /></div>
                    <div><label className="form-label">Kerning ({captionKerning})</label><input aria-label="Caption kerning" className="form-range" type="range" min={-10} max={10} step={1} value={captionKerning} onChange={(event) => setCaptionKerning(Number(event.target.value))} /></div>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Right-to-left text<input type="checkbox" checked={captionRightToLeft} onChange={(event) => { setCaptionRightToLeft(event.target.checked); if (event.target.checked) setCaptionFont('Arial.ttf'); }} /></label>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Translate captions to English<input type="checkbox" checked={captionTranslate} onChange={(event) => setCaptionTranslate(event.target.checked)} /></label>
                  </div>
                </details>
              </div>
            </div>
          )}

          {isSocialResize && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>1. Choose a source video</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                  Create platform-ready 9:16, 1:1, or 16:9 exports from an existing clip. This local resize pass is free; outputs are saved to your Library.
                </p>
              </div>
              <label style={{ border: '2px dashed var(--panel-border)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', background: referenceVideos.length ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)' }}>
                <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => { const input = event.currentTarget; const files = input.files; void handleSocialResizeVideoUpload(files).finally(() => { input.value = ''; }); }} style={{ display: 'none' }} />
                <strong style={{ display: 'block' }}>{referenceVideos[0]?.name || 'Choose video to resize'}</strong>
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>{referenceVideoDuration ? `${referenceVideoDuration.toFixed(1)} seconds` : 'Maximum 180 seconds / 200 MB'}</span>
              </label>

              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>2. Pick export format</h3>
                <div className="caption-control-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.85rem' }}>
                  <div>
                    <label className="form-label">Target format</label>
                    <select aria-label="Resize format" className="form-select" value={resizeFormat} onChange={(event) => setResizeFormat(event.target.value as 'vertical' | 'square' | 'landscape')}>
                      <option value="vertical">9:16 Reels / Shorts</option>
                      <option value="square">1:1 Feed Square</option>
                      <option value="landscape">16:9 YouTube / Web</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Framing mode</label>
                    <select aria-label="Resize mode" className="form-select" value={resizeMode} onChange={(event) => setResizeMode(event.target.value as 'crop' | 'fit')}>
                      <option value="crop">Fill frame crop</option>
                      <option value="fit">Fit with letterbox</option>
                    </select>
                  </div>
                </div>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', margin: '0.65rem 0 0' }}>
                  Crop is best for punchy social clips. Fit preserves the full frame with padding when you do not want to lose edges.
                </p>
              </div>
            </div>
          )}

          {isSeedance && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>1. Add multimodal references</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                  Optional. Use [Image1], [Video1], and [Audio1] in your prompt to reference uploaded files.
                </p>
              </div>
              <div className="reference-upload-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' }}>
                {([
                  { kind: 'image', label: 'Images', accept: 'image/*', maximum: 9, files: referenceImages },
                  { kind: 'video', label: 'Videos', accept: 'video/*', maximum: 3, files: referenceVideos },
                  { kind: 'audio', label: 'Audio', accept: 'audio/*', maximum: 3, files: referenceAudio },
                ] as const).map((input) => (
                  <label
                    key={input.kind}
                    style={{
                      border: '2px dashed var(--panel-border)',
                      borderRadius: '12px',
                      padding: '1rem',
                      cursor: 'pointer',
                      minWidth: 0,
                      background: input.files.length ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <input
                      type="file"
                      accept={input.accept}
                      multiple
                      onChange={(event) => void handleReferenceUpload(event.target.files, input.kind)}
                      style={{ display: 'none' }}
                    />
                    <strong style={{ display: 'block', fontSize: '0.9rem' }}>{input.label}</strong>
                    <span style={{ display: 'block', color: 'var(--foreground-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {input.files.length ? `${input.files.length} selected` : `Up to ${input.maximum}`}
                    </span>
                    {input.files.length > 0 && (
                      <span style={{ display: 'block', color: 'var(--primary)', fontSize: '0.7rem', marginTop: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {input.files.map((file) => file.name).join(', ')}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="reference-frame-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
                {([
                  { position: 'first', label: 'First frame', file: firstFrame },
                  { position: 'last', label: 'Last frame', file: lastFrame },
                ] as const).map((input) => (
                  <label
                    key={input.position}
                    style={{
                      border: '1px solid var(--panel-border)',
                      borderRadius: '10px',
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      background: input.file ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => void handleFrameUpload(event.target.files, input.position)}
                      style={{ display: 'none' }}
                    />
                    <strong style={{ fontSize: '0.82rem' }}>{input.label}</strong>
                    <span style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                      {input.file?.name || 'Optional image'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {(workflow === 'text-to-video' || workflow === 'text-to-image' || isSeedance || isKlingEdit || isGrokImagineVideo || isPrunaAvatar || (isVideoEnhance && model === 'xai/grok-imagine-video-extension')) && (
            <>
              <div className="prompt-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{isSeedance || isGrokImagineVideo || isVideoEnhance || isPrunaAvatar ? '2.' : isKlingEdit ? '4.' : '1.'} {isPrunaAvatar ? 'Optional avatar direction' : 'Describe your creative vision'}</h3>
                <button
                  onClick={handleEnhancePrompt}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  disabled={!prompt}
                >
                  🪄 Enhance Prompt
                </button>
              </div>
              <textarea
                className="form-textarea"
                rows={5}
                placeholder={isPrunaAvatar ? 'The person speaks naturally to camera with warm studio lighting, subtle head movement, and friendly expression.' : 'A majestic golden dragon soaring over neon skyscrapers at sunset, reflection mapping on building glass...'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['Cinematic', 'Cyberpunk', 'Anime Style', 'Retro 80s', 'Vintage Film'].map((pill) => (
                  <span
                    key={pill}
                    onClick={() => setPrompt((prev) => (prev ? `${prev}, ${pill.toLowerCase()}` : pill))}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--panel-border)',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '20px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      color: 'var(--foreground-muted)',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                  >
                    + {pill}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Generate / Status Board */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
          {generationError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', color: '#ef4444' }}>
              {generationError}
            </div>
          )}
          {uploadProgress !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>Uploading media… {uploadProgress}%</span>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary)', transition: 'width 150ms ease' }} />
              </div>
            </div>
          )}

          {!isGenerating ? (
            <div className="generate-ready-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                  {generationStatus === 'succeeded' ? '✅ Generation Complete!' : 'Ready to Generate'}
                </h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {generationStatus === 'succeeded'
                    ? 'Your asset has been added to the library.'
                    : token
                      ? displayedCredits === null
                        ? 'Inspecting the source to calculate an exact credit charge…'
                        : `This request will consume ${displayedCredits} credit${displayedCredits === 1 ? '' : 's'}.${isVideoEnhance || isImageUpscale || isVideoCaption || isSocialResize ? ' Exact price verified from the source media.' : ' Variations cost extra.'}`
                      : 'Sign in to start generating.'}
                </p>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleGenerate}
                disabled={
                  !token ||
                  (workflow === 'text-to-video' && !prompt) ||
                  (workflow === 'text-to-image' && !prompt) ||
                  (isGrokImagineVideo && !prompt) ||
                  (workflow === 'multimodal-video' && !prompt) ||
                  (workflow === 'video-edit' && (!prompt || !referenceVideos[0])) ||
                  (workflow === 'video-enhance' && (!referenceVideos[0] || (model === 'xai/grok-imagine-video-extension' && !prompt))) ||
                  (workflow === 'image-upscale' && !imageStorageObjectId) ||
                  (isVideoCaption && !referenceVideos[0]) ||
                  (isSocialResize && !referenceVideos[0]) ||
                  ((workflow === 'video-enhance' || workflow === 'image-upscale' || workflow === 'video-caption' || workflow === 'social-resize') && enhancementQuote === null) ||
                  (workflow === 'image-to-video' && !imageStorageObjectId) ||
                  (workflow === 'lip-sync' && (!imageStorageObjectId || !audioStorageObjectId)) || uploadProgress !== null
                }
                style={{ padding: '1rem 2.5rem', fontSize: '1.05rem', opacity: !token || 
                  (workflow === 'text-to-video' && !prompt) ||
                  (workflow === 'text-to-image' && !prompt) ||
                  (isGrokImagineVideo && !prompt) ||
                  (workflow === 'multimodal-video' && !prompt) ||
                  (workflow === 'video-edit' && (!prompt || !referenceVideos[0])) ||
                  (workflow === 'video-enhance' && (!referenceVideos[0] || (model === 'xai/grok-imagine-video-extension' && !prompt))) ||
                  (workflow === 'image-upscale' && !imageStorageObjectId) ||
                  (isVideoCaption && !referenceVideos[0]) ||
                  (isSocialResize && !referenceVideos[0]) ||
                  ((workflow === 'video-enhance' || workflow === 'image-upscale' || workflow === 'video-caption' || workflow === 'social-resize') && enhancementQuote === null) ||
                  (workflow === 'image-to-video' && !imageStorageObjectId) ||
                  (workflow === 'lip-sync' && (!imageStorageObjectId || !audioStorageObjectId)) || uploadProgress !== null ? 0.5 : 1 }}
              >
                🚀 Generate Output
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="badge badge-purple" style={{ display: 'inline-flex', gap: '0.25rem' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', border: '2px solid', borderRadius: '50%', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', marginRight: '0.25rem' }}></span>
                    {generationStatus === 'submitting' ? 'Submitting...' : 'Generating...'}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)', marginLeft: '1rem' }}>
                    Model: {model}
                  </span>
                </div>
                <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>{Math.round(generationProgress)}%</strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${generationProgress}%`, height: '100%', background: 'linear-gradient(135deg, #c084fc 0%, #8b5cf6 100%)', borderRadius: '4px', transition: 'width 0.3s' }}></div>
              </div>
            </div>
          )}
        </div>

        {/* Results Display */}
        {lastGeneratedAsset && (
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', borderLeft: '4px solid var(--accent)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>📺 Generated Output</h3>
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9' }}>
              {lastGeneratedAsset.type === 'video' ? (
                <video
                  src={lastGeneratedAsset.url}
                  controls
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <img
                  src={lastGeneratedAsset.url}
                  alt="Generated"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>
            <div className="result-actions" style={{ display: 'flex', gap: '1rem' }}>
              <a
                href={lastGeneratedAsset.url}
                download
                className="btn btn-primary"
                style={{ flex: 1, textAlign: 'center' }}
              >
                ⬇️ Download
              </a>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setPrompt('');
                  setLastGeneratedAsset(null);
                  setVariationResults([]);
                  setGenerationStatus('');
                  setGenerationProgress(0);
                }}
                style={{ flex: 1 }}
              >
                ✨ Create New
              </button>
            </div>
            {variationResults.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {variationResults.map((result) => (
                  <div key={result.id} style={{ border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '0.75rem', background: 'rgba(255,255,255,0.03)' }}>
                    <strong style={{ fontSize: '0.85rem' }}>Variation {result.variationIndex + 1}</strong>
                    <span style={{ display: 'block', color: 'var(--foreground-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0.5rem' }}>
                      {result.status}
                    </span>
                    {result.url ? (
                      result.type === 'video' ? (
                        <video src={result.url} controls style={{ width: '100%', borderRadius: '8px', aspectRatio: '16/9', objectFit: 'cover' }} />
                      ) : (
                        <img src={result.url} alt={`Variation ${result.variationIndex + 1}`} style={{ width: '100%', borderRadius: '8px', aspectRatio: '16/9', objectFit: 'cover' }} />
                      )
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '90px', borderRadius: '8px', background: 'rgba(0,0,0,0.25)', color: 'var(--foreground-muted)', fontSize: '0.8rem' }}>
                        Processing...
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Panel (Right Column) */}
      <aside className="glass-card studio-settings" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', height: 'fit-content' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.75rem' }}>
          🔧 Settings
        </h3>

        <div>
          <label className="form-label">Project</label>
          <select className="form-select" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem' }}>
            <input
              className="form-input"
              placeholder="Quick project name"
              value={quickProjectName}
              onChange={(e) => setQuickProjectName(e.target.value)}
            />
            <button className="btn btn-secondary" onClick={handleQuickCreateProject} disabled={!token || !quickProjectName.trim()}>
              Add
            </button>
          </div>
        </div>

        {/* Model Selector */}
        <div>
          <label className="form-label">AI Engine Model</label>
          <select
            className="form-select"
            value={model}
            onChange={(e) => {
              const nextModel = e.target.value;
              setModel(nextModel);
              applyModelControlDefaults(nextModel);
              if (nextModel === 'xai/grok-imagine-video-1.5') {
                setResolution('720p');
                setAspectRatio('auto');
              } else if (workflow === 'image-to-video') {
                setAspectRatio('16:9');
              }
              if (nextModel === 'google/nano-banana-pro') setImageResolution('2K');
              if (nextModel === 'google/nano-banana-2') setImageResolution('1K');
              if (nextModel === 'prunaai/p-video-avatar') setResolution('720p');
              if (nextModel === 'bytedance/seedance-2.0-mini' && resolution === '1080p') {
                setResolution('720p');
              }
            }}
          >
            {workflowModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.speed})
              </option>
            ))}
          </select>
        </div>

        <DynamicModelControls model={activeModelDefinition} values={dynamicControlValues} onChange={updateDynamicControl} />

        {isKlingEdit && (
          <>
            <div>
              <label className="form-label">Quality</label>
              <select className="form-select" value={klingMode} onChange={(e) => setKlingMode(e.target.value)}>
                <option value="standard">Standard (720p)</option>
                <option value="pro">Pro (1080p)</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '0.9rem' }}>
              Keep original video sound
              <input type="checkbox" checked={keepOriginalSound} onChange={(e) => setKeepOriginalSound(e.target.checked)} />
            </label>
            <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', margin: 0 }}>
              Output length follows the source video. Native audio generation is disabled because Kling cannot combine it with a reference video.
            </p>
          </>
        )}

        {workflow === 'text-to-image' && (isNanoBanana || isRecraft) && (
          <>
            <div>
              <label className="form-label">Aspect Ratio</label>
              <select className="form-select" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                {(isRecraft
                  ? ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '4:5', '5:4']
                  : ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']
                ).map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </div>
            {isNanoBanana && (
              <>
                <div>
                  <label className="form-label">Resolution</label>
                  <select className="form-select" value={imageResolution} onChange={(e) => setImageResolution(e.target.value)}>
                    {['1K', '2K', '4K'].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Output Format</label>
                  <select className="form-select" value={imageOutputFormat} onChange={(e) => setImageOutputFormat(e.target.value)}>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
              </>
            )}
            {isRecraft && (
              <div>
                <label className="form-label">Design Style</label>
                <select className="form-select" value={recraftStyle} onChange={(e) => setRecraftStyle(e.target.value)}>
                  <option value="any">Automatic</option>
                  <option value="realistic_image">Realistic Image</option>
                  <option value="digital_illustration">Digital Illustration</option>
                  <option value="vector_illustration">Vector Illustration</option>
                </select>
              </div>
            )}
          </>
        )}

        {isGrokImagineVideo && (
          <>
            <div>
              <label className="form-label">Resolution</label>
              <select className="form-select" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                <option value="480p">480p</option>
                <option value="720p">720p</option>
              </select>
            </div>
            <div>
              <label className="form-label">Aspect Ratio</label>
              <select className="form-select" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                {['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].map((ratio) => (
                  <option key={ratio} value={ratio}>{ratio === 'auto' ? 'Auto (match image)' : ratio}</option>
                ))}
              </select>
            </div>
            <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', margin: 0 }}>
              Grok generates synchronized audio automatically. Billing is 2 credits per output second.
            </p>
          </>
        )}

        {isPrunaAvatar && (
          <>
            <div>
              <label className="form-label">Resolution</label>
              <select className="form-select" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </div>
            <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', margin: 0 }}>
              P-Video Avatar uses your portrait plus uploaded audio. The optional text prompt only guides the visual speaking style.
            </p>
          </>
        )}

        {supportsCinematicControls && (
          <CinematicControls value={cinematicSettings} onChange={setCinematicSettings} />
        )}

        {!isVideoEnhance && !isImageUpscale && !isVideoCaption && !isSocialResize ? <div>
          <label className="form-label">Variations</label>
          <select className="form-select" value={variations} onChange={(e) => setVariations(Number(e.target.value))}>
            {[1, 2, 3, 4].map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? 'output' : 'outputs'}
              </option>
            ))}
          </select>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', marginTop: '0.5rem', marginBottom: 0 }}>
            Credit estimate: {baseCredits} base + {Math.max(0, variations - 1)} variation{variations === 2 ? '' : 's'} = {totalCredits}
          </p>
        </div> : (
          <div style={{ padding: '0.8rem', border: '1px solid var(--panel-border)', borderRadius: '10px' }}>
            <strong>{enhancementQuote === null ? 'Inspecting source…' : `Exact charge: ${enhancementQuote} credits`}</strong>
            <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
              {enhancementQuoteError || (isSocialResize
                ? 'Free local FFmpeg export. Source ownership and the 180-second limit are verified before processing.'
                : isVideoCaption
                  ? 'Fixed at 4 credits for one captioned video plus its editable transcript. Source ownership and the 60-second limit are verified before submission.'
                  : 'Calculated server-side from the inspected source duration, dimensions, FPS, and selected output size before provider submission.')}
            </p>
          </div>
        )}

        {/* Duration Slider */}
        {workflow !== 'text-to-image' && !isSeedance && !isKlingEdit && !isVideoEnhance && !isImageUpscale && !isVideoCaption && !isSocialResize && (
          <div className="slider-container">
            <div className="slider-header">
              <span>Duration</span>
              <strong>{duration}s</strong>
            </div>
            <input type="range" min={isGrokImagineVideo ? 1 : 5} max={15} step={isGrokImagineVideo ? 1 : 5} className="form-range" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        )}

        {isSeedance && (
          <>
            <div>
              <label className="form-label">Duration</label>
              <select className="form-select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={-1}>Auto (intelligent)</option>
                {[5, 6, 7, 8, 9, 10, 12, 15].map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds} seconds</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Resolution</label>
              <select className="form-select" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                {model !== 'bytedance/seedance-2.0-mini' && <option value="1080p">1080p</option>}
              </select>
            </div>
            <div>
              <label className="form-label">Aspect Ratio</label>
              <select className="form-select" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                {['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].map((ratio) => (
                  <option key={ratio} value={ratio}>{ratio === 'adaptive' ? 'Adaptive' : ratio}</option>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '0.9rem' }}>
              Generate synchronized audio
              <input type="checkbox" checked={generateAudio} onChange={(e) => setGenerateAudio(e.target.checked)} />
            </label>
            <div>
              <label className="form-label">Seed (optional)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step={1}
                placeholder="Random"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </div>
          </>
        )}

        {/* FPS Slider */}
        {workflow !== 'text-to-image' && !isSeedance && !isKlingEdit && !isVideoEnhance && !isImageUpscale && !isVideoCaption && (
          <div className="slider-container">
            <div className="slider-header">
              <span>Frame Rate</span>
              <strong>{fps} FPS</strong>
            </div>
            <input type="range" min={24} max={60} step={6} className="form-range" value={fps} onChange={(e) => setFps(Number(e.target.value))} />
          </div>
        )}

        {/* Camera Moves */}
        {workflow !== 'text-to-image' && !isSeedance && !isKlingEdit && !isVideoEnhance && !isImageUpscale && !isVideoCaption && (
          <div>
            <label className="form-label">Camera Motion</label>
            <select className="form-select" value={cameraMove} onChange={(e) => setCameraMove(e.target.value)}>
              <option value="none">Static Camera</option>
              <option value="pan-right">Pan Right</option>
              <option value="tilt-up">Tilt Up</option>
              <option value="zoom-in">Zoom In</option>
              <option value="dynamic">Dynamic Tracking</option>
            </select>
          </div>
        )}

        {/* Motion Strength (Image-to-Video only) */}
        {workflow === 'image-to-video' && (
          <div className="slider-container">
            <div className="slider-header">
              <span>Motion Intensity</span>
              <strong>{(motionStrength * 100).toFixed(0)}%</strong>
            </div>
            <input type="range" min={0.5} max={2} step={0.1} className="form-range" value={motionStrength} onChange={(e) => setMotionStrength(Number(e.target.value))} />
          </div>
        )}
      </aside>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
