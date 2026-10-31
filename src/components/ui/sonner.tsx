import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Mensagens ficam 8 s na tela e têm botão de fechar: o público precisa de tempo para ler. */
const Toaster = (props: ToasterProps) => (
  <Sonner theme="system" position="top-center" duration={8000} closeButton richColors
    toastOptions={{ style: { fontSize: "1rem" } }} {...props} />
);

export { Toaster };
