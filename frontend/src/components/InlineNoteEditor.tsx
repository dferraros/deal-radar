import { useState, useRef } from "react";
import { TextInput } from "@tremor/react";
import axios from "axios";

interface InlineNoteEditorProps {
  watchlistItemId: string;
  initialNote: string | null;
  onSave?: (newNote: string) => void;
}

export default function InlineNoteEditor({
  watchlistItemId,
  initialNote,
  onSave,
}: InlineNoteEditorProps) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote ?? "");
  const [draft, setDraft] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const startEditing = () => {
    setDraft(note);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(note);
    setEditing(false);
  };

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setEditing(false);

    if (draft === note) {
      savingRef.current = false;
      return; // no change
    }

    const prev = note;
    setNote(draft); // optimistic

    try {
      await axios.put(`/api/watchlist/${watchlistItemId}/notes`, {
        notes: draft,
      });
      onSave?.(draft);
    } catch {
      setNote(prev); // revert
      setError("Failed to save note. Try again.");
      setTimeout(() => setError(null), 3000);
    } finally {
      savingRef.current = false;
    }
  };

  if (editing) {
    return (
      <div>
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              await save();
            }
            if (e.key === "Escape") {
              cancel();
            }
          }}
          onBlur={save}
          autoFocus
          className="text-sm"
        />
      </div>
    );
  }

  return (
    <div>
      {note ? (
        <span
          onClick={startEditing}
          className="text-sm text-gray-300 italic cursor-pointer hover:text-gray-100 line-clamp-1 block"
        >
          {note}
        </span>
      ) : (
        <span
          onClick={startEditing}
          className="text-sm text-gray-500 italic cursor-pointer hover:text-gray-300"
        >
          + Add note
        </span>
      )}
      {error && (
        <span className="text-xs text-red-400 block mt-0.5">{error}</span>
      )}
    </div>
  );
}
