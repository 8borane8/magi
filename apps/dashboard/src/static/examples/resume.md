> [!fiche] Physique · Électrocinétique · Semestre 1
>
> CM du 12 mars · 1 h 20
>
> Prérequis : [Lois de Kirchhoff](/l/demo-kirchhoff), [Le condensateur idéal](/l/demo-condensateur),
> [Équations différentielles linéaires](/l/demo-ed)
>
> Suit : [Circuit RL](/l/demo-rl), [Circuit RLC série](/l/demo-rlc)

On étudie un circuit {def}RC série{/def} soumis à un {def}échelon de tension{/def}. L'objectif du cours : écrire
l'équation différentielle, la résoudre, et savoir reconstruire les circuits équivalents en {thm}$t = 0^+${/thm} et en
{thm}régime permanent{/thm}.

## Plan

1. Grandeurs et schéma
2. Définitions ($\tau$, régimes, échelon)
3. Propriétés (continuité, équivalents)
4. Équation différentielle et solutions
5. Démonstrations (ED + bilan d'énergie)
6. Lecture des courbes et valeurs numériques
7. Méthode type DS et pièges

## Schéma du circuit

![Circuit RC série : générateur E, interrupteur K, résistance R et condensateur C](/examples/rc-circuit.svg)

_Figure 1. Circuit RC série. L'interrupteur $K$ est fermé à $t = 0$. On note $u_C$ la tension aux bornes de $C$, $i$ le
courant en convention récepteur sur $C$._

| Grandeur              | Symbole                                       | Unité SI     | Rôle                                    |
| --------------------- | --------------------------------------------- | ------------ | --------------------------------------- |
| Tension du générateur | $E$                                           | $\mathrm{V}$ | Force électromotrice constante          |
| Résistance            | $R$                                           | $\Omega$     | Dissipe l'énergie, fixe $\tau$ avec $C$ |
| Capacité              | $C$                                           | $\mathrm{F}$ | Stocke l'énergie $\frac{1}{2} C u_C^2$  |
| Constante de temps    | $\tau = RC$                                   | $\mathrm{s}$ | Échelle de temps du transitoire         |
| Tension condensateur  | $u_C(t)$                                      | $\mathrm{V}$ | Inconnue principale                     |
| Courant               | $i(t) = C \dfrac{\mathrm{d}u_C}{\mathrm{d}t}$ | $\mathrm{A}$ | Peut être discontinu                    |

## Définitions

> [!définition] Constante de temps
>
> On appelle {def}constante de temps{/def} du circuit RC la grandeur
>
> $$
>
>> \tau = RC $$
>
> Elle a la dimension d'un temps. Toute évolution libre du circuit se fait en $e^{-t/\tau}$.

> [!définition] Régime transitoire
>
> Le {def}régime transitoire{/def} est la phase pendant laquelle les grandeurs dépendent encore du temps de façon non
> triviale. On le considère {prop}terminé à $t \approx 5\tau${/prop} (il reste moins de $1\,\%$ à parcourir).

> [!définition] Régime permanent
>
> Le {def}régime permanent{/def} (ou établi) est atteint lorsque toutes les grandeurs sont devenues constantes. Dans un
> circuit RC alimenté en continu :
>
> - $i(\infty) = 0$
> - $u_C(\infty) = E$ (charge) ou $0$ (décharge)

> [!définition] Échelon de tension
>
> Un {def}échelon{/def} est une tension qui passe instantanément de $0$ à $E$ à $t = 0$. C'est le modèle de la fermeture
> de $K$ sur un générateur idéal. Voir [Signaux et régimes](/l/demo-signaux).

## Propriétés

> [!propriété] Continuité de la tension aux bornes de $C$
>
> La tension {thm}$u_C$ est toujours continue{/thm} : $u_C(0^+) = u_C(0^-)$.
>
> Conséquence : le courant $i = C \frac{\mathrm{d}u_C}{\mathrm{d}t}$ **peut**, lui, sauter. On n'écrit jamais
> $i(0^+) = i(0^-)$ sans justification.

> [!propriété] Circuits équivalents
>
> - À {prop}$t = 0^+${/prop}, un condensateur initialement déchargé se comporte comme un **fil** ($u_C = 0$).
> - À {prop}$t \to \infty${/prop}, il se comporte comme un **interrupteur ouvert** ($i = 0$).
> - Un condensateur déjà chargé à $U_0$ se remplace, à $t = 0^+$, par un générateur de tension $U_0$.

![Circuits équivalents du condensateur à t = 0+ et en régime permanent](/examples/rc-equivalents.svg)

_Figure 2. Deux photographies du circuit, à utiliser systématiquement avant de résoudre l'équation différentielle._

> [!propriété] Valeurs remarquables à $t = \tau$
>
> - Charge : $u_C(\tau) = E \left(1 - \frac{1}{e}\right) \approx 0{,}63\,E$
> - Décharge : $u_C(\tau) = \frac{U_0}{e} \approx 0{,}37\,U_0$
> - Dans les deux cas, $i$ a été divisé par $e$

## Équation différentielle et solutions

> [!théorème] Équation du circuit à la charge
>
> La loi des mailles et $i = C \frac{\mathrm{d}u_C}{\mathrm{d}t}$ donnent l'équation différentielle linéaire du premier
> ordre
>
> $$
>
>> \tau \frac{\mathrm{d}u_C}{\mathrm{d}t} + u_C = E $$
>
> avec $\tau = RC$ et la condition initiale $u_C(0^+) = 0$ si $C$ est initialement déchargé.

$$
\begin{aligned}
u_C(t) &= E \left(1 - e^{-t/\tau}\right) \\[0.4em]
i(t) &= \frac{E}{R}\, e^{-t/\tau}
\end{aligned}
$$

> [!théorème] Décharge dans $R$
>
> Si on court-circuite un condensateur chargé à $U_0$ sur $R$ :
>
> $$
>
>> \tau \frac{\mathrm{d}u_C}{\mathrm{d}t} + u_C = 0 \qquad u_C(0^+) = U_0 $$
>
> $$
>
>> \begin{aligned} u_C(t) &= U_0\, e^{-t/\tau} \\[0.4em] i(t) &= -\frac{U_0}{R}\, e^{-t/\tau} \end{aligned} $$
>
> Le signe moins : le courant s'inverse par rapport à la charge.

| Instant        | Charge ($u_C(0) = 0$)   | Décharge ($u_C(0) = U_0$) |
| -------------- | ----------------------- | ------------------------- |
| $t = 0^-$      | $u_C = 0$, $i = 0$      | $u_C = U_0$, $i = 0$      |
| $t = 0^+$      | $u_C = 0$, $i = E/R$    | $u_C = U_0$, $i = -U_0/R$ |
| $t = \tau$     | $u_C \approx 0{,}63\,E$ | $u_C \approx 0{,}37\,U_0$ |
| $t = 3\tau$    | $u_C \approx 0{,}95\,E$ | $u_C \approx 0{,}05\,U_0$ |
| $t = 5\tau$    | $u_C \approx 0{,}99\,E$ | $u_C \approx 0{,}01\,U_0$ |
| $t \to \infty$ | $u_C = E$, $i = 0$      | $u_C = 0$, $i = 0$        |

## Démonstrations

> [!démonstration] Établissement de l'équation différentielle
>
> 1. Loi des mailles (voir [Lois de Kirchhoff](/l/demo-kirchhoff)) : $u_R + u_C = E$.
> 2. Loi d'Ohm : $u_R = Ri$.
> 3. Loi du condensateur : $i = C \frac{\mathrm{d}u_C}{\mathrm{d}t}$ (convention récepteur).
> 4. On substitue : $RC \frac{\mathrm{d}u_C}{\mathrm{d}t} + u_C = E$.
> 5. On pose {def}$\tau = RC${/def}. On obtient $\tau u' + u = E$.
>
> ==Toujours partir des lois, jamais de la solution à apprendre par cœur.== Au DS, le barème est sur le raisonnement.

> [!démonstration] Résolution (charge, $C$ déchargé)
>
> Solution générale de $\tau u' + u = E$ :
>
> - solution homogène : $u_h = A e^{-t/\tau}$
> - solution particulière constante : $u_p = E$
> - donc $u_C(t) = E + A e^{-t/\tau}$
>
> Condition initiale : {thm}continuité{/thm} $u_C(0^+) = u_C(0^-) = 0$, d'où $E + A = 0$, donc $A = -E$.
>
> $$
>
>> u_C(t) = E \left(1 - e^{-t/\tau}\right) $$
>
> Puis $i = C u_C'$ donne $i(t) = \frac{E}{R} e^{-t/\tau}$.

> [!démonstration] Bilan d'énergie à la charge
>
> Énergie fournie par le générateur jusqu'à l'infini :
>
> $$
>
>> W_E = \int_0^{\infty} E\, i(t)\, \mathrm{d}t = E \cdot CE = CE^2 $$
>
> Énergie stockée dans $C$ : $W_C = \frac{1}{2} C E^2$.
>
> Énergie dissipée dans $R$ :
>
> $$
>
>> W_R = \int_0^{\infty} R i^2(t)\, \mathrm{d}t = \frac{1}{2} C E^2 $$
>
> {warn}La moitié de l'énergie fournie est perdue en chaleur, quelle que soit $R$.{/warn} $R$ change seulement la durée,
> pas le bilan. Lien avec [Énergie électrique](/l/demo-energie).

## Courbes

![Courbes de charge de la tension u_C(t) et du courant i(t), avec les instants τ, 3τ et 5τ](/examples/rc-courbes.svg)

_Figure 3. Charge depuis $u_C(0) = 0$. La tangente à l'origine de $u_C$ coupe l'asymptote $E$ en $t = \tau$._

> [!retenir] Lecture graphique
>
> - La {prop}tangente à l'origine{/prop} de $u_C$ pendant la charge coupe $u = E$ en $t = \tau$. C'est le moyen le plus
>   rapide de lire $\tau$ sur un oscillo.
> - $i(t)$ et $u_R(t)$ ont **la même allure** (proportionnelles).
> - $u_C$ et $i$ n'ont jamais le même profil : l'une monte, l'autre descend.

## Méthode type DS

1. Schéma + conventions (flèches $i$ et $u_C$ cohérentes)
2. {def}Continuité{/def} de $u_C$ : calculer $u_C(0^+)$
3. Circuits équivalents : {prop}$t = 0^+${/prop} et {prop}$t \to \infty${/prop}, en déduire $i(0^+)$ et $u_C(\infty)$
4. Loi des mailles $\to$ ED $\to$ identifier $\tau$
5. Écrire la forme $u(t) = u(\infty) + \bigl(u(0^+) - u(\infty)\bigr) e^{-t/\tau}$
6. En déduire $i(t)$, éventuellement $u_R(t)$
7. Contrôle : signes, unités, allure, $t = 5\tau$

> [!attention] Pièges classiques
>
> - Oublier que {warn}$u_C$ est continue mais pas $i${/warn}
> - Prendre $\tau = R/C$ ou $\tau = 1/RC$ (c'est $\tau = RC$)
> - Confondre charge et décharge dans le signe de $i$
> - Dire « $C$ est un circuit ouvert à $t = 0$ » : c'est l'inverse si $C$ est déchargé
> - Appliquer $u_C = Q/C$ sans avoir dit que $C$ est idéal ([Le condensateur idéal](/l/demo-condensateur))
> - Croire que diminuer $R$ diminue l'énergie dissipée : {warn}$W_R = \frac{1}{2}CE^2$ toujours{/warn}

## Pour la colle

- Énoncer et démontrer l'ED du RC à la charge, en justifiant $u_C(0^+)$
- Montrer que $u_C(\tau) = \left(1 - \frac{1}{e}\right) E$ sans calculatrice
- Faire le bilan d'énergie et commenter l'indépendance vis-à-vis de $R$
- Tracer $u_C$ et $i$ sur le même axe des temps, placer $\tau$, $3\tau$, $5\tau$
- Passer au [RL](/l/demo-rl) : quelle grandeur est continue, et pourquoi ? (c'est $i$, dual de $u_C$)

> [!liens] Enchaîner les cours
>
> - [Lois de Kirchhoff](/l/demo-kirchhoff) : mailles et nœuds, conventions
> - [Le condensateur idéal](/l/demo-condensateur) : $i = C \frac{\mathrm{d}u}{\mathrm{d}t}$, continuité, énergie
> - [Équations différentielles linéaires](/l/demo-ed) : homogène + particulière, CI
> - [Circuit RL](/l/demo-rl) : dual, $\tau = L/R$, continuité du courant
> - [Circuit RLC série](/l/demo-rlc) : régime du second ordre, facteur de qualité
> - [Énergie électrique](/l/demo-energie) : $W_C = \frac{1}{2}CU^2$, effet Joule
> - [Équations de Maxwell](/l/demo-maxwell) : d'où vient $i = C \frac{\mathrm{d}u}{\mathrm{d}t}$ (courant de
>   déplacement)
