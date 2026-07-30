// Page Preloader Dismissal Control
    (function () {
      const start = Date.now();
      const statusText = document.querySelector('.preloader-status');
      const percentText = document.querySelector('.preloader-percent');
      const progressCircle = document.querySelector('.svg-progress');

      const circumference = 2 * Math.PI * 66; // 414.69

      const phrases = [
        'Connecting to server...',
        'Loading school assets...',
        'Optimizing portals...',
        'Preparing excellence...'
      ];

      let progress = 0;
      let targetProgress = 0;
      let isLoaded = false;

      // Update status phrases based on progress range
      function getStatusPhrase(prog) {
        if (prog < 25) return phrases[0];
        if (prog < 55) return phrases[1];
        if (prog < 85) return phrases[2];
        return phrases[3];
      }

      // Smooth progress frame loops
      function updateProgress() {
        if (progress < targetProgress) {
          progress += (targetProgress - progress) * 0.08; // Smooth ease-out interpolation
          if (targetProgress - progress < 0.2) {
            progress = targetProgress;
          }

          const roundedProg = Math.floor(progress);

          // Update percentage text
          if (percentText) {
            percentText.textContent = `${roundedProg}%`;
          }

          // Update SVG stroke-dashoffset
          if (progressCircle) {
            const offset = circumference - (progress / 100) * circumference;
            progressCircle.style.strokeDashoffset = offset;
          }

          // Update status phrase
          if (statusText) {
            const currentPhrase = getStatusPhrase(roundedProg);
            if (statusText.textContent !== currentPhrase && !isLoaded) {
              statusText.style.opacity = '0';
              setTimeout(() => {
                if (!isLoaded) {
                  statusText.textContent = currentPhrase;
                  statusText.style.opacity = '1';
                }
              }, 150);
            }
          }
        }

        if (progress < 100) {
          requestAnimationFrame(updateProgress);
        } else {
          // Final Welcome state
          if (statusText) {
            statusText.style.transition = 'opacity 0.2s ease';
            statusText.style.opacity = '0';
            setTimeout(() => {
              statusText.textContent = 'Welcome!';
              statusText.style.opacity = '1';
            }, 200);
          }

          // Fade out and remove preloader
          const elapsed = Date.now() - start;
          const delay = Math.max(100, 500 - elapsed);

          setTimeout(() => {
            const preloader = document.getElementById('preloader');
            if (preloader) {
              preloader.classList.add('fade-out');
              document.documentElement.style.overflow = '';
              document.body.style.overflow = '';
              setTimeout(() => preloader.remove(), 400);
            }
          }, delay);
        }
      }

      // Start the frame loop
      requestAnimationFrame(updateProgress);

      // Simulated progress ticker (fake loading state until actual load event)
      let tickerInterval = setInterval(() => {
        if (!isLoaded) {
          // Increment slowly up to 96%
          if (targetProgress < 96) {
            targetProgress += Math.random() * 12 + 5;
            if (targetProgress > 96) targetProgress = 96;
          }
        } else {
          clearInterval(tickerInterval);
        }
      }, 50); // Much faster ticker

      function finishLoading() {
        isLoaded = true;
        clearInterval(tickerInterval);
        targetProgress = 100;
      }

      window.addEventListener('load', finishLoading);
      setTimeout(finishLoading, 1500); // Faster fallback dismissal
    })();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Registration failed', err));
      });
    }

    // Scroll listener for CSS Parallax variables
    window.addEventListener('scroll', () => {
      document.documentElement.style.setProperty('--scroll-y', `${window.scrollY}px`);
    }, { passive: true });

    // Scroll Reveal Intersection Observer
    document.addEventListener('DOMContentLoaded', () => {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

      document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => {
        revealObserver.observe(el);
      });

      // Stats Count Up Animation Observer
      const countUp = (el) => {
        const target = +el.getAttribute('data-target');
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 1600;
        const startTime = performance.now();

        const update = (now) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease-out Quad curve
          const value = Math.floor(progress * (2 - progress) * target);
          el.textContent = value + suffix;

          if (progress < 1) {
            requestAnimationFrame(update);
          } else {
            el.textContent = target + suffix;
          }
        };
        requestAnimationFrame(update);
      };

      const statsObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.querySelectorAll('.stat-num').forEach(countUp);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });

      const statsBarEl = document.querySelector('.stats-bar');
      if (statsBarEl) statsObserver.observe(statsBarEl);
    });



    // Hero bg video — Optimized single video playback
    (function () {
      const vid = document.getElementById('heroBgVideo');
      if (!vid) return;

      // Respect reduced-motion preference
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        vid.style.display = 'none';
        return;
      }

      const isMobile = window.innerWidth <= 768;
      
      // Smart poster switching to prevent downloading the large PC image on mobile
      if (isMobile) {
        vid.setAttribute('poster', 'assets/video/mobile.jpg');
      }

      const RATE = isMobile ? 1.0 : 0.55; // normal speed on mobile, cinematic slow on desktop

      // ── Set slow playback rate (iOS resets it, so we re-apply) ──
      function applyRate() {
        try { vid.playbackRate = RATE; } catch (e) { }
      }

      vid.addEventListener('play', applyRate);
      vid.addEventListener('ratechange', applyRate);
      
      // Ensure it starts playing if it hasn't already (some mobile browsers block autoplay until interaction)
      vid.play().catch(function() {
        // Autoplay blocked, poster image will remain visible
      });
    })();