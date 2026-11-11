import { ClockAlertIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';

import { appeler, messageErreur, supprimer } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLecture } from '@/outils/useLecture';
import type { FileMj } from '@/types/FileMj';
import type { LettreATraiter } from '@/types/LettreATraiter';
import type { Traitement } from '@/types/Traitement';

import { Attente, Confirmation, Entete, Section } from './commun';
import { dateLisible, delaiLisible, Lettre, LienBouton, MINUTES_DE_RATTRAPAGE } from './courrier';

/** Le nom du destinataire que vise l'auteur, tel que le MJ le lit. */
export function nomDuDestinataire(lettre: LettreATraiter): string {
  switch (lettre.destinataire.genre) {
    case 'personnage':
      return lettre.destinataire.nom;
    case 'gazette':
      return 'la gazette';
    case 'libre':
      return `« ${lettre.destinataire.adresse} »`;
  }
}

/** La file du MJ : les lettres des joueurs qui attendent sa décision. */
export function ATraiter() {
  const { donnees, erreur, recharger } = useLecture<FileMj>('/mj/a-traiter');
  const [aClasser, setAClasser] = useState<LettreATraiter | null>(null);

  if (!donnees) return <Attente erreur={erreur} />;

  const courrier = donnees.lettres.filter((lettre) => lettre.destinataire.genre !== 'gazette');
  const pourLaGazette = donnees.lettres.filter((lettre) => lettre.destinataire.genre === 'gazette');

  async function agir(geste: () => Promise<unknown>, succes: string) {
    try {
      await geste();
      toast.success(succes);
    } catch (e) {
      toast.error(messageErreur(e));
    }
    await recharger();
  }

  /** La validation en un clic : au destinataire visé, à la date proposée. */
  const valider = (lettre: LettreATraiter, succes: string) =>
    agir(
      () =>
        appeler(`/mj/a-traiter/${lettre.id}/traitement`, {
          destinataire_id: null,
          decision: 'livrer',
          livraison_le: null,
          copies: [],
          reponse: null,
        } satisfies Traitement),
      succes,
    );
  const ecarter = (lettre: LettreATraiter) =>
    agir(() => appeler(`/mj/a-traiter/${lettre.id}/ecart`, {}), 'Lettre écartée');
  const reprendre = (lettre: LettreATraiter) =>
    agir(() => supprimer(`/mj/a-traiter/${lettre.id}/ecart`), 'Lettre remise dans la file');

  function actions(lettre: LettreATraiter) {
    const ouvrir = `/mj/a-traiter/${lettre.id}`;
    switch (lettre.destinataire.genre) {
      case 'personnage':
        return lettre.destinataire.pnj ? (
          <>
            <LienBouton vers={ouvrir}>Répondre</LienBouton>
            <Button variant="outline" onClick={() => setAClasser(lettre)}>
              Classer sans réponse
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => valider(lettre, `En route vers ${nomDuDestinataire(lettre)}`)}>
              Valider
            </Button>
            <LienBouton vers={ouvrir} variant="outline">
              Ouvrir
            </LienBouton>
          </>
        );
      case 'libre':
        return (
          <>
            <LienBouton vers={ouvrir}>Choisir le destinataire</LienBouton>
            <Button variant="ghost" onClick={() => ecarter(lettre)}>
              Écarter
            </Button>
          </>
        );
      case 'gazette':
        return (
          <>
            <Button variant="outline" onClick={() => ecarter(lettre)}>
              Écarter
            </Button>
            <LienBouton vers={ouvrir} variant="ghost">
              Ouvrir
            </LienBouton>
          </>
        );
    }
  }

  return (
    <>
      <Entete titre="À traiter" />

      {courrier.length === 0 ? (
        <p className="text-muted-foreground">Aucune lettre n'attend votre décision.</p>
      ) : (
        <ul className="grid gap-4">
          {courrier.map((lettre) => (
            <Carte key={lettre.id} lettre={lettre}>
              {actions(lettre)}
            </Carte>
          ))}
        </ul>
      )}

      {pourLaGazette.length > 0 && (
        <Section
          titre="Pour la gazette"
          aide="Ces lettres attendent la composition d'un numéro. D'ici là, vous pouvez les écarter, ou en remettre une à quelqu'un."
        >
          <ul className="grid gap-4">
            {pourLaGazette.map((lettre) => (
              <Carte key={lettre.id} lettre={lettre}>
                {actions(lettre)}
              </Carte>
            ))}
          </ul>
        </Section>
      )}

      {donnees.ecartees.length > 0 && (
        <Section titre="Écartées" aide="Elles n'iront nulle part, sauf si vous les reprenez.">
          <ul className="grid gap-4">
            {donnees.ecartees.map((lettre) => (
              <Carte key={lettre.id} lettre={lettre} ecartee>
                <Button variant="outline" onClick={() => reprendre(lettre)}>
                  Remettre dans la file
                </Button>
              </Carte>
            ))}
          </ul>
        </Section>
      )}

      <Confirmation
        ouverte={aClasser !== null}
        titre="Classer sans réponse ?"
        texte={`${aClasser ? nomDuDestinataire(aClasser) : ''} a reçu cette lettre et n'y répond pas. Elle quitte la file.`}
        action="Classer"
        destructrice={false}
        surReponse={(confirme) => {
          const lettre = aClasser;
          setAClasser(null);
          if (confirme && lettre) void valider(lettre, 'Lettre classée');
        }}
      />
    </>
  );
}

/** Une lettre de la file : qui écrit à qui, quand, et ses premières lignes. */
function Carte({
  lettre,
  ecartee = false,
  children,
}: {
  lettre: LettreATraiter;
  ecartee?: boolean;
  children: ReactNode;
}) {
  const { destinataire } = lettre;
  return (
    <li className="rounded-xl bg-background p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="font-medium text-balance">
          {lettre.auteur_nom} à {nomDuDestinataire(lettre)}
        </h3>
        {destinataire.genre === 'personnage' && destinataire.pnj && (
          <Badge variant="secondary">PNJ</Badge>
        )}
        {destinataire.genre === 'libre' && <Badge variant="secondary">Adresse libre</Badge>}
        {!ecartee && lettre.date_depassee && (
          <Badge variant="destructive">
            <ClockAlertIcon />
            Date dépassée
          </Badge>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Envoyée {dateLisible(lettre.envoye_le)}
        {!ecartee &&
          (lettre.date_depassee
            ? ` · livraison proposée ${dateLisible(lettre.date_proposee)}, déjà passée : elle arrivera ${MINUTES_DE_RATTRAPAGE} minutes après votre validation`
            : ` · livraison proposée ${dateLisible(lettre.date_proposee)} (${delaiLisible(lettre.date_proposee)})`)}
      </p>

      <Lettre
        className="mt-3"
        texte={lettre.texte}
        police={lettre.police}
        signature={lettre.signe ? lettre.auteur_nom : null}
        sceau={lettre.sceau}
        tronquee
      />

      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </li>
  );
}
