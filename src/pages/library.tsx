import { useState, useRef, useCallback } from 'react';
import { Film, Trash2, Edit2, Check, X, Star, AlertCircle } from 'lucide-react';import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useMedia } from '@/context/MediaContext';
import type { MediaItem } from '@/types/media';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'fetching' | 'done' | 'error';
  result?: MediaItem;
  error?: string;
}

interface EditState {
  id: string;
  title: string;
  year: string;
  genre: string;
  poster: string;
  plot: string;
}

export default function LibraryPage() {
  const { library, loading, refreshLibrary, deleteMedia, updateMedia } = useMedia();
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const genId = () => Math.random().toString(36).slice(2);

  const uploadFile = useCallback(async (file: File) => {
    const id = genId();
    setUploading(prev => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }]);

    const formData = new FormData();
    formData.append('video', file);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploading(prev => prev.map(u =>
          u.id === id && u.progress < 85 ? { ...u, progress: u.progress + 10 } : u
        ));
      }, 300);

      setUploading(prev => prev.map(u => u.id === id ? { ...u, status: 'uploading', progress: 10 } : u));

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      setUploading(prev => prev.map(u => u.id === id ? { ...u, status: 'fetching', progress: 90 } : u));

      const item: MediaItem = await res.json();

      setUploading(prev => prev.map(u => u.id === id ? { ...u, status: 'done', progress: 100, result: item } : u));
      await refreshLibrary();
      toast.success(`"${item.title}" added to your library!`);
    } catch (err) {
      setUploading(prev => prev.map(u =>
        u.id === id ? { ...u, status: 'error', error: String(err) } : u
      ));
      toast.error(`Failed to upload ${file.name}`);
    }
  }, [refreshLibrary]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const startEdit = (item: MediaItem) => {
    setEditState({
      id: item.id,
      title: item.title,
      year: item.year,
      genre: item.genre.join(', '),
      poster: item.poster,
      plot: item.plot,
    });
  };

  const saveEdit = async () => {
    if (!editState) return;
    await updateMedia(editState.id, {
      title: editState.title,
      year: editState.year,
      genre: editState.genre.split(',').map(g => g.trim()),
      poster: editState.poster,
      plot: editState.plot,
    });
    setEditState(null);
    toast.success('Updated successfully');
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const item = library.find(m => m.id === deleteId);
    await deleteMedia(deleteId);
    setDeleteId(null);
    toast.success(`"${item?.title}" removed from library`);
  };

  return (
    <div className="min-h-screen bg-background pt-20 pb-16">
      <title>My Library — HomeStream</title>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-heading text-foreground mb-2">My Library</h1>
        <p className="text-muted-foreground mb-8">Upload your video files — we'll automatically fetch the poster and metadata.</p>

        {/* Upload Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all mb-8 ${
            dragging
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/50 hover:bg-card/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mp4,.mkv,.avi,.mov,.wmv,.m4v"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <Film className={`w-12 h-12 mx-auto mb-4 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
          <p className="text-lg font-medium text-foreground mb-1">Drop your video files here</p>
          <p className="text-sm text-muted-foreground mb-3">or click to browse</p>
          <p className="text-xs text-muted-foreground">Supports: MP4, MKV, AVI, MOV, WMV, M4V</p>
        </div>

        {/* Upload Progress */}
        <AnimatePresence>
          {uploading.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 flex flex-col gap-3"
            >
              {uploading.map(u => (
                <div key={u.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Film className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-foreground truncate">{u.name}</span>
                    </div>
                    <span className={`text-xs flex-shrink-0 ml-2 ${
                      u.status === 'done' ? 'text-green-400' :
                      u.status === 'error' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`}>
                      {u.status === 'uploading' ? 'Uploading...' :
                       u.status === 'fetching' ? 'Fetching movie info...' :
                       u.status === 'done' ? '✓ Done' : '✗ Error'}
                    </span>
                  </div>
                  {u.status !== 'error' && (
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${u.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                  {u.status === 'error' && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {u.error}
                    </p>
                  )}
                  {u.status === 'done' && u.result && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                      <img src={u.result.poster} alt={u.result.title} className="w-10 h-14 object-cover rounded" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{u.result.title}</p>
                        <p className="text-xs text-muted-foreground">{u.result.year} · {u.result.genre.slice(0, 2).join(', ')}</p>
                        {u.result.imdbRating !== 'N/A' && (
                          <p className="text-xs text-accent flex items-center gap-0.5 mt-0.5">
                            <Star className="w-3 h-3 fill-accent" /> {u.result.imdbRating}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Library Grid */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading text-foreground">
            {library.length} Title{library.length !== 1 ? 's' : ''}
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[2/3] rounded-lg" />
                <Skeleton className="h-3 mt-2 rounded" />
              </div>
            ))}
          </div>
        ) : library.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No media yet. Upload your first file above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {library.map(item => (
              <div key={item.id} className="group relative">
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-card">
                  <img
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = `https://via.placeholder.com/300x450/141420/e50914?text=${encodeURIComponent(item.title)}`; }}
                  />
                  {/* Actions overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                    <button
                      onClick={() => startEdit(item)}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={() => setDeleteId(item.id)}
                      className="p-2 bg-destructive/80 hover:bg-destructive rounded-full transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
                <div className="mt-1.5">
                  <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">{item.year}</p>
                    {item.imdbRating !== 'N/A' && (
                      <p className="text-[10px] text-accent flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-accent" /> {item.imdbRating}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Remove from library?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete the file and remove it from your library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-foreground border-border hover:bg-secondary/70">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/80 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Modal */}
      <AnimatePresence>
        {editState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setEditState(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-heading text-foreground">Edit Metadata</h3>
                <button onClick={() => setEditState(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Title', key: 'title' as const },
                  { label: 'Year', key: 'year' as const },
                  { label: 'Genre (comma separated)', key: 'genre' as const },
                  { label: 'Poster URL', key: 'poster' as const },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{field.label}</label>
                    <input
                      type="text"
                      value={editState[field.key]}
                      onChange={e => setEditState(prev => prev ? { ...prev, [field.key]: e.target.value } : null)}
                      className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Plot</label>
                  <textarea
                    value={editState.plot}
                    onChange={e => setEditState(prev => prev ? { ...prev, plot: e.target.value } : null)}
                    rows={3}
                    className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={saveEdit}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 text-white py-2 rounded font-medium text-sm transition-colors"
                >
                  <Check className="w-4 h-4" /> Save Changes
                </button>
                <button
                  onClick={() => setEditState(null)}
                  className="px-4 bg-secondary hover:bg-secondary/70 text-foreground py-2 rounded text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
