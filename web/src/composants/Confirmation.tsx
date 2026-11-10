import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  ouverte: boolean;
  titre: string;
  texte: string;
  action: string;
  /** Un geste qui détruit quelque chose s'affiche en rouge. */
  destructrice?: boolean;
  surReponse: (confirme: boolean) => void;
};

/** Une demande de confirmation avant un geste sans retour. */
export function Confirmation({
  ouverte,
  titre,
  texte,
  action,
  destructrice = true,
  surReponse,
}: Props) {
  return (
    <Dialog open={ouverte} onOpenChange={(ouvert) => !ouvert && surReponse(false)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          <DialogDescription>{texte}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => surReponse(false)}>
            Annuler
          </Button>
          <Button
            variant={destructrice ? 'destructive' : 'default'}
            onClick={() => surReponse(true)}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
