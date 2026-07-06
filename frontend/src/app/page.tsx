'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './layout';

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
  const [keepOriginalSound, setKeepOriginalSound] = useState(true);
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

  const workflows = [
    { id: 'text-to-video', name: 'Text-to-Video', icon: '📝' },
    { id: 'image-to-video', name: 'Image-to-Video', icon: '🖼️' },
    { id: 'lip-sync', name: 'Lip Sync / Talking Avatar', icon: '🗣️' },
    { id: 'text-to-image', name: 'Image Generation', icon: '🎨' },
    { id: 'multimodal-video', name: 'Seedance Studio', icon: '🎞️' },
    { id: 'character-replace', name: 'Character Replace', icon: '🎭' },
  ];

  const modelsForWorkflow: Record<string, { id: string; name: string; speed: string }[]> = {
    'text-to-video': [
      { id: 'alibaba/happyhorse-1.1', name: 'Happy Horse 1.1', speed: 'Fast' },
      { id: 'openai/sora-2', name: 'Sora 2', speed: 'High Quality' },
      { id: 'kuaishou/kling-v2-1', name: 'Kling 2.1', speed: 'Balanced' },
    ],
    'image-to-video': [
      { id: 'xai/grok-imagine-video-1.5', name: 'Grok Imagine Video 1.5', speed: 'Native Audio' },
      { id: 'bytedance/wan-2.5-fast', name: 'Wan 2.5 Fast', speed: 'Ultrafast' },
      { id: 'minimax/hailuo-live', name: 'Hailuo Live', speed: 'Cinematic' },
    ],
    'lip-sync': [
      { id: 'bytedance/omni-human', name: 'OmniHuman V1', speed: 'High Fidelity' },
      { id: 'bytedance/omni-human-1.5', name: 'OmniHuman 1.5', speed: 'Latest' },
    ],
    'text-to-image': [
      { id: 'black-forest-labs/flux-schnell', name: 'Flux Schnell', speed: 'Speed' },
      { id: 'stability-ai/stable-diffusion-3', name: 'Stable Diffusion 3', speed: 'Accurate' },
      { id: 'google/nano-banana-2', name: 'Nano Banana 2', speed: 'Fast + Editing' },
      { id: 'google/nano-banana-pro', name: 'Nano Banana Pro', speed: 'Premium Quality' },
      { id: 'recraft-ai/recraft-v3', name: 'Recraft V3', speed: 'Design + Typography' },
    ],
    'multimodal-video': [
      { id: 'bytedance/seedance-2.0', name: 'Seedance 2.0', speed: 'Best Quality' },
      { id: 'bytedance/seedance-2.0-fast', name: 'Seedance 2.0 Fast', speed: 'Fast' },
      { id: 'bytedance/seedance-2.0-mini', name: 'Seedance 2.0 Mini', speed: 'Lower Cost' },
    ],
    'character-replace': [
      { id: 'kwaivgi/kling-v3-omni-video', name: 'Kling V3 Omni Video', speed: 'Video Editing' },
    ],
  };

  const isSeedance = workflow === 'multimodal-video';
  const isCharacterReplace = workflow === 'character-replace';
  const isNanoBanana = model === 'google/nano-banana-2' || model === 'google/nano-banana-pro';
  const isRecraft = model === 'recraft-ai/recraft-v3';
  const isGrokImagineVideo = model === 'xai/grok-imagine-video-1.5';

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
      setSelectedProjectId(projectId);
      setSelectedSceneId(sceneId);
      setPrompt(scene.prompt || '');
      if (scene.durationSeconds) setDuration(scene.durationSeconds);
      setWorkflow('text-to-video');
      setModel('alibaba/happyhorse-1.1');
    }).catch((error) => setGenerationError(error.message || 'Failed to load storyboard scene'));
  }, [token]);

  const getBaseCredits = () => {
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
      setReferenceImages(await uploadReferenceFiles(files, 1, 'image'));
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Character image upload failed');
    }
  };

  const handleCharacterVideoUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setGenerationError('');
      const measured = await readVideoDuration(file);
      if (measured < 3 || measured > 10.05) {
        throw new Error(`Reference video must be between 3 and 10 seconds. This video is ${measured.toFixed(1)} seconds.`);
      }
      setReferenceVideoDuration(measured);
      setReferenceVideos(await uploadReferenceFiles(files, 1, 'video'));
    } catch (error) {
      setReferenceVideos([]);
      setReferenceVideoDuration(null);
      setGenerationError(error instanceof Error ? error.message : 'Reference video upload failed');
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
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setGenerationError('Image must be smaller than 10MB');
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
      }
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) { // 50MB limit for audio
        setGenerationError('Audio file must be smaller than 50MB');
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
      }
    }
  };

  const supportedLibraryTypes: Array<'image' | 'video' | 'audio'> =
    workflow === 'image-to-video' || (workflow === 'text-to-image' && isNanoBanana)
      ? ['image']
      : workflow === 'lip-sync'
        ? ['image', 'audio']
        : isCharacterReplace
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

    if (workflow === 'image-to-video') {
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
    if (isCharacterReplace) {
      if (asset.type === 'image') setReferenceImages([reference]);
      if (asset.type === 'video') {
        setReferenceVideos([reference]);
        setReferenceVideoDuration(null);
      }
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
    if (workflow === 'text-to-video' || workflow === 'text-to-image' || workflow === 'multimodal-video' || workflow === 'character-replace') {
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
    }
    if (workflow === 'character-replace' && (!referenceImages[0] || !referenceVideos[0])) {
      setGenerationError('Please upload one character image and a 3–10 second reference video.');
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
      const generatePayload: any = {
        workflow,
        model,
        prompt,
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
      } else if (isCharacterReplace) {
        generatePayload.params.reference_image_ids = referenceImages.slice(0, 1).map((file) => file.id);
        generatePayload.params.reference_video_id = referenceVideos[0]?.id;
        generatePayload.params.mode = klingMode;
        generatePayload.params.keep_original_sound = keepOriginalSound;
        generatePayload.params.generate_audio = false;
        generatePayload.params.duration = referenceVideoDuration || undefined;
      }

      // Add file data if needed
      if (imageStorageObjectId && workflow === 'image-to-video') {
        generatePayload.image_storage_object_id = imageStorageObjectId;
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
                  setModel(modelsForWorkflow[wf.id][0].id);
                  setDuration(wf.id === 'multimodal-video' ? -1 : 5);
                  setResolution('720p');
                  setImageResolution('1K');
                  setImageOutputFormat('jpg');
                  setRecraftStyle('any');
                  setAspectRatio(wf.id === 'multimodal-video' ? 'adaptive' : wf.id === 'image-to-video' ? 'auto' : '16:9');
                  if (wf.id === 'character-replace') {
                    setPrompt('Replace the person in <<<video_1>>> with the person from <<<image_1>>>, preserving the original motion, framing, lighting, and scene.');
                    setGenerateAudio(false);
                    setReferenceImages([]);
                    setReferenceVideos([]);
                    setReferenceVideoDuration(null);
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
          {workflow === 'image-to-video' && (
            <>
              <div className="prompt-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>1. Upload reference image</h3>
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

          {isCharacterReplace && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>1. Upload the replacement character</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                  Use one clear JPG or PNG showing the person who should replace the character in the source video.
                </p>
              </div>
              <label style={{ border: '2px dashed var(--panel-border)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', background: referenceImages.length ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)' }}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleCharacterImageUpload(event.target.files)} style={{ display: 'none' }} />
                <strong style={{ display: 'block' }}>{referenceImages[0]?.name || 'Choose character image'}</strong>
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>Maximum 10 MB</span>
              </label>

              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>2. Upload the source video</h3>
                <p style={{ color: 'var(--foreground-muted)', fontSize: '0.82rem', margin: 0 }}>
                  The video must be 3–10 seconds long. Longer videos are rejected before generation and no credits are charged.
                </p>
              </div>
              <label style={{ border: '2px dashed var(--panel-border)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', background: referenceVideos.length ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)' }}>
                <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => void handleCharacterVideoUpload(event.target.files)} style={{ display: 'none' }} />
                <strong style={{ display: 'block' }}>{referenceVideos[0]?.name || 'Choose 3–10 second video'}</strong>
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>
                  {referenceVideoDuration ? `${referenceVideoDuration.toFixed(1)} seconds` : 'Maximum 200 MB'}
                </span>
              </label>
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

          {(workflow === 'text-to-video' || workflow === 'text-to-image' || isSeedance || isCharacterReplace || isGrokImagineVideo) && (
            <>
              <div className="prompt-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{isSeedance || isGrokImagineVideo ? '2.' : isCharacterReplace ? '3.' : '1.'} Describe your creative vision</h3>
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
                placeholder="A majestic golden dragon soaring over neon skyscrapers at sunset, reflection mapping on building glass..."
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
                      ? `This request will consume ${totalCredits} credit${totalCredits === 1 ? '' : 's'}. Variations cost extra.`
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
                  (workflow === 'character-replace' && (!prompt || !referenceImages[0] || !referenceVideos[0])) ||
                  (workflow === 'image-to-video' && !imageStorageObjectId) ||
                  (workflow === 'lip-sync' && (!imageStorageObjectId || !audioStorageObjectId)) || uploadProgress !== null
                }
                style={{ padding: '1rem 2.5rem', fontSize: '1.05rem', opacity: !token || 
                  (workflow === 'text-to-video' && !prompt) ||
                  (workflow === 'text-to-image' && !prompt) ||
                  (isGrokImagineVideo && !prompt) ||
                  (workflow === 'multimodal-video' && !prompt) ||
                  (workflow === 'character-replace' && (!prompt || !referenceImages[0] || !referenceVideos[0])) ||
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
              if (nextModel === 'xai/grok-imagine-video-1.5') {
                setResolution('720p');
                setAspectRatio('auto');
              } else if (workflow === 'image-to-video') {
                setAspectRatio('16:9');
              }
              if (nextModel === 'google/nano-banana-pro') setImageResolution('2K');
              if (nextModel === 'google/nano-banana-2') setImageResolution('1K');
              if (nextModel === 'bytedance/seedance-2.0-mini' && resolution === '1080p') {
                setResolution('720p');
              }
            }}
          >
            {modelsForWorkflow[workflow]?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.speed})
              </option>
            ))}
          </select>
        </div>

        {isCharacterReplace && (
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

        <div>
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
        </div>

        {/* Duration Slider */}
        {workflow !== 'text-to-image' && !isSeedance && !isCharacterReplace && (
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
        {workflow !== 'text-to-image' && !isSeedance && !isCharacterReplace && (
          <div className="slider-container">
            <div className="slider-header">
              <span>Frame Rate</span>
              <strong>{fps} FPS</strong>
            </div>
            <input type="range" min={24} max={60} step={6} className="form-range" value={fps} onChange={(e) => setFps(Number(e.target.value))} />
          </div>
        )}

        {/* Camera Moves */}
        {workflow !== 'text-to-image' && !isSeedance && !isCharacterReplace && (
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
