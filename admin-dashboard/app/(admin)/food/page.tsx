'use client';

import { useAuth } from '@/components/AuthProvider';
import { db, storage } from '@/lib/firebase';
import type { FoodTemplate, FoodTemplateWrite } from '@/types/food';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useState } from 'react';

const COL = 'foodTemplates';
const MAX = 10;

function mapDoc(
  id: string,
  data: Record<string, unknown>,
): FoodTemplate {
  const createdAt = data.createdAt as Timestamp | undefined;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    price:
      typeof data.price === 'number' && Number.isFinite(data.price)
        ? data.price
        : 0,
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    active: data.active === false ? false : true,
    createdAt: createdAt ?? null,
  };
}

export default function FoodAdminPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FoodTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, COL),
      orderBy('createdAt', 'desc'),
      limit(MAX),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) =>
            mapDoc(d.id, d.data() as Record<string, unknown>),
          ),
        );
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName('');
    setDescription('');
    setPriceStr('');
    setImageUrl('');
    setActive(true);
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(row: FoodTemplate) {
    setEditingId(row.id);
    setName(row.name);
    setDescription(row.description);
    setPriceStr(String(row.price));
    setImageUrl(row.imageUrl);
    setActive(row.active);
    setShowForm(true);
  }

  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const uid = user?.uid;
    if (!file || !uid) return;
    setUploadBusy(true);
    try {
      const path = `foodTemplates/${uid}/${Date.now()}.jpg`;
      const r = ref(storage, path);
      await uploadBytes(r, file, {
        contentType: file.type || 'image/jpeg',
      });
      const url = await getDownloadURL(r);
      setImageUrl(url);
    } catch {
      setError('Image upload failed.');
    } finally {
      setUploadBusy(false);
    }
  }

  async function saveTemplate() {
    const price = Number(priceStr);
    if (!name.trim() || !description.trim() || !imageUrl.trim()) {
      setError('Name, description, and image are required.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a valid price.');
      return;
    }
    const payload: FoodTemplateWrite = {
      name: name.trim(),
      description: description.trim(),
      price,
      imageUrl: imageUrl.trim(),
      active,
    };
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateDoc(doc(db, COL, editingId), {
          name: payload.name,
          description: payload.description,
          price: payload.price,
          imageUrl: payload.imageUrl,
          active: payload.active,
        });
      } else {
        const snap = await getDocs(collection(db, COL));
        if (snap.size >= MAX) {
          setError(`Maximum ${MAX} templates. Delete one to add another.`);
          setSaving(false);
          return;
        }
        await addDoc(collection(db, COL), {
          name: payload.name,
          description: payload.description,
          price: payload.price,
          imageUrl: payload.imageUrl,
          active: payload.active,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
      setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      await deleteDoc(doc(db, COL, id));
      if (editingId === id) {
        resetForm();
        setShowForm(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Food cards</h1>
          <p className="mt-1 text-sm text-slate-500">
            Menu templates · max {MAX} · synced with the mobile app
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={rows.length >= MAX}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-40"
        >
          Add card
        </button>
      </div>

      {error ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {showForm ? (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            {editingId ? 'Edit template' : 'New template'}
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <input
                type="file"
                accept="image/*"
                onChange={onUploadFile}
                disabled={uploadBusy}
                className="w-full text-sm text-slate-600"
              />
              {uploadBusy ? (
                <p className="text-xs text-slate-500">Uploading…</p>
              ) : null}
              <input
                placeholder="Or paste image URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              {imageUrl ? (
                <div className="relative h-40 w-full overflow-hidden rounded-lg bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
            </div>
            <div className="space-y-3">
              <input
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Price"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                type="number"
                step="0.01"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Visible on home
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={saveTemplate}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <p className="text-slate-600">No templates yet</p>
          <button
            type="button"
            onClick={startCreate}
            className="mt-3 text-sm font-semibold text-slate-900 underline"
          >
            Add your first card
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] bg-slate-100">
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {!row.active ? (
                  <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-semibold text-amber-200">
                    Hidden
                  </span>
                ) : null}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-slate-900">{row.name}</h3>
                <p className="mt-1 text-lg font-semibold text-emerald-600">
                  ${row.price.toFixed(2)}
                </p>
                <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                  {row.description}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="flex-1 rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
