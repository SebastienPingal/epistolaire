import { Button } from '@/components/ui/button';
import { Attente } from '@/composants/Attente';
import { Cachet } from '@/composants/Cachet';
import { Main } from '@/composants/Main';
import { useLecture } from '@/outils/useLecture';
import { vocabulaire } from '@/theme/neutre';
import type { MaFiche } from '@/types/MaFiche';

const mots = vocabulaire.fiche;

/** La fiche du personnage, telle que le MJ l'a rédigée. Le joueur la lit, sans la modifier. */
export function Fiche({ surDeconnexion }: { surDeconnexion: () => void }) {
  const { donnees, erreur } = useLecture<MaFiche>('/joueur/fiche');

  if (!donnees) return <Attente erreur={erreur} />;

  return (
    <>
      <h1 className="mb-8 text-3xl">
        <Main police={donnees.police}>{donnees.nom}</Main>
      </h1>

      <dl className="grid gap-6">
        <Rubrique titre={mots.role} texte={donnees.role} />
        <Rubrique titre={mots.domaine} texte={donnees.domaine} />
        <Rubrique titre={mots.aptitudes} texte={donnees.aptitudes} />
        <Rubrique titre={mots.objectifs} texte={donnees.objectifs} />
      </dl>

      <h2 className="mt-10 mb-3 font-serif text-lg">{mots.sceaux}</h2>
      {donnees.sceaux.length === 0 ? (
        <p className="text-muted-foreground">{mots.aucunSceau}</p>
      ) : (
        <ul className="flex flex-wrap gap-4">
          {donnees.sceaux.map((sceau) => (
            <li key={sceau.id} className="flex items-center gap-3">
              <Cachet initiales={sceau.initiales} nom={sceau.nom_grave} />
              <span>{sceau.nom_grave}</span>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" className="mt-12 h-11" onClick={surDeconnexion}>
        {mots.deconnexion}
      </Button>
    </>
  );
}

function Rubrique({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div>
      <dt className="font-serif text-lg">{titre}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-pretty">
        {texte.trim() === '' ? (
          <span className="text-muted-foreground">{mots.nonRenseigne}</span>
        ) : (
          texte
        )}
      </dd>
    </div>
  );
}
