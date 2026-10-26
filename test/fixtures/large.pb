// Ten modules or more: top to bottom unless -dir is given
- Pam (1) c> Seq (Clk)
- Seq (Pitch) p> VCO 1 (V/Oct)
- Seq (Gate) g> ADSR (Gate)
- VCO 1 (Saw) -> Filter (In)
- VCO 2 (Square) -> Filter (In 2)
- Filter (LP) -> VCA (In)
- ADSR (Out) >> VCA (CV)
- VCA (Out) -> Delay (In)
- Delay (Out) -> Mixer (Ch 1)
- Delay (Wet) -> Delay (Feedback)
- Mixer (Out) -> Filter (FM)
- 2 (Out) >> 10 (In)
- 10 (Out) >> 2 (In)
- Café Ünïcode (Out) -> Mixer (Ch 2)
- Ultra-Perc / A&B (Out) t> Seq (Reset)
* Pam:
| BPM = 120
| Swing = 10%
* Lonely: Knob = 50%
* VCO 1: Fine = +3 | Coarse = C2 | Wave = "saw"
