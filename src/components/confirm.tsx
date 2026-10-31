import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

interface Options { title: string; description: string; action: string; destructive?: boolean }
type Pending = Options & { resolve: (value: boolean) => void };

let show: ((pending: Pending) => void) | undefined;

/** Replaces window.confirm: the button says what will happen ("Apagar resultados"), not just "OK". */
export const confirm = (options: Options) =>
  new Promise<boolean>((resolve) => show?.({ ...options, resolve }));

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => { show = setPending; }, []);
  const answer = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };
  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) answer(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-xl">{pending?.title}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={buttonVariants({ variant: "outline" })} onClick={() => answer(false)}>Voltar</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: pending?.destructive ? "destructive" : "default" })} onClick={() => answer(true)}>
            {pending?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
