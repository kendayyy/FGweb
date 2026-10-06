# Visibility probe correction

native-social-3 checked viewport bounds and center only, which misses clipping by the panel ancestor. Visual review of its actual 360 screenshot still shows clipping.

native-social-4 strengthened hit testing at rectangle corners but failed at desktop1440 before mobile: rounded controls do not occupy their rectangular corners. This is not sufficient to attribute that result to a production defect. Preserve exit1 evidence.

Replace those corner samples with edge midpoints inset2px and center, which lie within rounded controls while detecting ancestor clipping at their edges. Preserve every existing business assertion, viewport check and screenshot. Failure messages now include the actual viewport. This correction avoids treating rounded corners as clipping; it does not relax the requirement that the input and send control be wholly usable on mobile.
