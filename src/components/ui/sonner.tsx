import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Messages stay for 8 s and have a close button: our audience needs time to read them. */
const Toaster = (props: ToasterProps) => (
  <Sonner theme="system" position="top-center" duration={8000} closeButton richColors
    toastOptions={{ style: { fontSize: "1rem" } }} {...props} />
);

export { Toaster };
