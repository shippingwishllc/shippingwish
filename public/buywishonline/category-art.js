(function () {
  var art = {
    deals: '/buywishonline/icons/deals.png',
    all: '/buywishonline/icons/all.png',
    'tech-gadgets': '/buywishonline/icons/tech.png',
    tech: '/buywishonline/icons/tech.png',
    phone: '/buywishonline/icons/tech.png',
    'home-living': '/buywishonline/icons/home.png',
    home: '/buywishonline/icons/home.png',
    kitchen: '/buywishonline/icons/home.png',
    fashion: '/buywishonline/icons/fashion.png',
    women: '/buywishonline/icons/fashion.png',
    men: '/buywishonline/icons/fashion.png',
    shoes: '/buywishonline/icons/fashion.png',
    jewelry: '/buywishonline/icons/fashion.png',
    bags: '/buywishonline/icons/fashion.png',
    beauty: '/buywishonline/icons/beauty.png',
    fitness: '/buywishonline/icons/fitness.png',
    pets: '/buywishonline/icons/pets.png',
    'kids-baby': '/buywishonline/icons/kids.png',
    kids: '/buywishonline/icons/kids.png',
    baby: '/buywishonline/icons/kids.png',
    travel: '/buywishonline/icons/travel.png',
    arts: '/buywishonline/icons/arts.png'
  };
  window.bwoCatArt = function (slug) {
    var key = String(slug || '').toLowerCase();
    return art[key] || art.all;
  };
  window.bwoCatArtHtml = function (slug) {
    return '<img class="cat-art" src="' + window.bwoCatArt(slug) + '" alt="">';
  };
})();
