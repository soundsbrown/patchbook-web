// One cable of each type: -> audio, >> CV, p> pitch, g> gate, t> trigger, c> clock
- Clock (Out) c> Sequencer (Clock)
- Sequencer (Pitch) p> Oscillator (V/Oct)
- Sequencer (Gate) g> Envelope (Gate)
- Sequencer (Accent) t> Drum (Trig)
- LFO (Tri) >> Oscillator (PWM)
- Oscillator (Square) -> Mixer (Ch 1)
- Drum (Out) -> Mixer (Ch 2)
- Envelope >> Mixer (CV 1)
* Oscillator: Wave = Square | Octave = 0
