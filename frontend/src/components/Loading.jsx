import { motion } from "framer-motion";

export default function Loading({ message = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        className="w-14 h-14 border-2 border-teal-500/30 border-t-teal-500 rounded-full"
      />
      <p className="mt-4 text-sm text-zinc-500">{message}</p>
    </div>
  );
}
