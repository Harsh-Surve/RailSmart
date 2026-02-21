export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export const hoverLift = {
  whileHover: { y: -4 },
  whileTap: { y: -1 },
  transition: { type: "spring", stiffness: 200 },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.4 },
};

export const pageFadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" },
};

export const filterButtonMotion = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.95 },
  transition: { type: "spring", stiffness: 300, damping: 22 },
};

export const chartFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3 },
};
