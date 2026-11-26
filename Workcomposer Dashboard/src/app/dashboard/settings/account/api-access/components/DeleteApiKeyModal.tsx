"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
};

export default function DeleteApiKeyModal({
  open,
  onClose,
  onDelete,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 shadow-2xl p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Delete API key
        </h2>

        <p className="mt-6 text-gray-600 dark:text-slate-300">
          Please confirm that you want to delete this API key.
        </p>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-6 py-2 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-600"
          >
            Cancel
          </button>

          <button
            onClick={onDelete}
            className="rounded-lg bg-red-600 px-6 py-2 text-white hover:bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}