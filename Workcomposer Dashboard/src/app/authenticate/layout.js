export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 to-white dark:from-slate-900 dark:to-[#090F1D] text-gray-900 dark:text-white transition-colors duration-200">
      {children}
    </div>
  );
}