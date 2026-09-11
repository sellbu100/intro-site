/* 연도 자동 표시 ------------------------------------------------------- */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* 스크롤 시 상단바 스타일 ---------------------------------------------- */
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* 요소 등장 애니메이션 -------------------------------------------------- */
const revealTargets = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        entry.target.style.transitionDelay = `${Math.min(i * 70, 280)}ms`;
        entry.target.classList.add("is-in");
        revealIO.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );
  revealTargets.forEach((el) => revealIO.observe(el));

  // 인쇄하거나 스크립트가 늦게 도는 경우를 대비한 안전장치
  setTimeout(() => {
    revealTargets.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-in");
    });
  }, 1200);
} else {
  revealTargets.forEach((el) => el.classList.add("is-in"));
}

/* 현재 보고 있는 섹션 메뉴 강조 ---------------------------------------- */
const links = [...document.querySelectorAll(".nav__menu a")];
const sections = links
  .map((a) => document.querySelector(a.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window && sections.length) {
  const setActive = (id) =>
    links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`));

  const navIO = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
  );
  sections.forEach((s) => navIO.observe(s));
}
