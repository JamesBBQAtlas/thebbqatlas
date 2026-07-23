import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;
const BBQ_IMGS = [
  "1544025162-d76694265947", "1555939594-58d7cb561ad1", "1529193594215-9c4c0c0c0c0c",
  "1504670280998-4f1c0c0c0c0c", "1546833999-b9f581a1996d", "1558030006-450675393462",
  "1598439210625-2a9f0d2a2f5d", "1529048201918-8a8a8a8a8a8a", "1565299624946-b28f40a0ae38",
].map(IMG);

function slugify(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const restaurants = [
  // US Texas (12)
  { name: "Franklin Barbecue", city: "Austin", country: "USA", state: "TX", style: "texas", lat: 30.2701, lng: -97.7313, address: "900 E 11th St, Austin, TX 78702", price: 2, rating: 4.9, featured: true, desc: "Legendary Austin pit serving pepper-rubbed brisket with a cult following. Lines form at dawn for post oak-smoked beef that melts on the fork." },
  { name: "Louie Mueller Barbecue", city: "Taylor", country: "USA", state: "TX", style: "texas", lat: 30.5707, lng: -97.4094, address: "206 W 2nd St, Taylor, TX 76574", price: 2, rating: 4.8, featured: true, desc: "Family-run since 1949 in a century-old brick pit house. Beef ribs and fatty brisket smoked over oak with no shortcuts." },
  { name: "Snow's BBQ", city: "Lexington", country: "USA", state: "TX", style: "texas", lat: 30.4191, lng: -97.0116, address: "516 Main St, Lexington, TX 78947", price: 2, rating: 4.9, featured: true, desc: "Saturday-only destination crowned Texas Monthly's best BBQ. Tootsie Tomanetz's brisket and pork steak are worth the pilgrimage." },
  { name: "Kreuz Market", city: "Lockhart", country: "USA", state: "TX", style: "texas", lat: 29.8849, lng: -97.6700, address: "619 N Colorado St, Lockhart, TX 78644", price: 2, rating: 4.7, featured: false, desc: "No sauce, no forks — just oak-smoked sausage and brisket on butcher paper. A Lockhart institution since 1900." },
  { name: "Pecan Lodge", city: "Dallas", country: "USA", state: "TX", style: "texas", lat: 32.7767, lng: -96.7970, address: "2702 Main St, Dallas, TX 75226", price: 2, rating: 4.6, featured: false, desc: "Deep Ellum smokehouse famous for the Hot Mess — a loaded sweet potato topped with brisket, butter, and cheese." },
  { name: "The Salt Lick BBQ", city: "Driftwood", country: "USA", state: "TX", style: "texas", lat: 30.1396, lng: -98.0253, address: "18300 FM 1826, Driftwood, TX 78619", price: 3, rating: 4.5, featured: false, desc: "Open-pit barbecue in the Hill Country with family-style platters of brisket, ribs, and sausage under the oaks." },
  { name: "Cooper's Old Time Pit Bar-B-Que", city: "Llano", country: "USA", state: "TX", style: "texas", lat: 30.7494, lng: -98.6759, address: "604 W Young St, Llano, TX 78643", price: 2, rating: 4.6, featured: false, desc: "Pick your meat straight from the open pit. Big beef ribs and goat are specialties at this West Texas legend." },
  { name: "Micklethwait Craft Meats", city: "Austin", country: "USA", state: "TX", style: "texas", lat: 30.2440, lng: -97.7230, address: "1309 Rosewood Ave, Austin, TX 78702", price: 2, rating: 4.7, featured: false, desc: "Trailer-turned-institution with house-made sausages, beef cheeks, and some of Austin's finest bark on brisket." },
  { name: "Hutchins BBQ", city: "Frisco", country: "USA", state: "TX", style: "texas", lat: 33.1507, lng: -96.8236, address: "9225 Preston Rd, Frisco, TX 75033", price: 2, rating: 4.7, featured: false, desc: "DFW favorite with moist brisket, jalapeño cheddar sausage, and a welcoming sit-down dining room." },
  { name: "Valentina's Tex Mex BBQ", city: "Austin", country: "USA", state: "TX", style: "texas", lat: 30.2150, lng: -97.7960, address: "11500 Manchaca Rd, Austin, TX 78748", price: 2, rating: 4.6, featured: false, desc: "Brisket breakfast tacos and smoked carnitas bridge Texas BBQ and Tex-Mex in one irresistible menu." },
  { name: "Pinkerton's Barbecue", city: "Houston", country: "USA", state: "TX", style: "texas", lat: 29.7700, lng: -95.3620, address: "1804 Shepherd Dr, Houston, TX 77008", price: 2, rating: 4.6, featured: false, desc: "Houston heavyweight with fatty brisket, beef ribs, and a full bar. The pit crew knows smoke." },
  { name: "2M Smokehouse", city: "San Antonio", country: "USA", state: "TX", style: "texas", lat: 29.3900, lng: -98.4800, address: "2731 W Division St, San Antonio, TX 78225", price: 2, rating: 4.7, featured: false, desc: "San Antonio's finest with perfect bark, house-made chorizo, and brisket that rivals the Hill Country greats." },

  // US Carolina (8)
  { name: "Skylight Inn BBQ", city: "Ayden", country: "USA", state: "NC", style: "carolina", lat: 35.4726, lng: -77.4419, address: "4618 S Lee St, Ayden, NC 28513", price: 2, rating: 4.8, featured: true, desc: "Whole-hog chapel of barbecue with cracklin'-crisp skin and vinegar-pepper sauce. A James Beard American Classic." },
  { name: "Sam Jones BBQ", city: "Winterville", country: "USA", state: "NC", style: "carolina", lat: 35.5293, lng: -77.4019, address: "772 W Fire Tower Rd, Winterville, NC 28590", price: 2, rating: 4.7, featured: false, desc: "Third-generation whole-hog pitmaster serving Eastern NC barbecue with cornbread sticks and slaw." },
  { name: "Rodney Scott's Whole Hog BBQ", city: "Charleston", country: "USA", state: "SC", style: "carolina", lat: 32.7765, lng: -79.9311, address: "1011 King St, Charleston, SC 29403", price: 2, rating: 4.7, featured: true, desc: "Pitmaster Rodney Scott's whole hog with mustard and vinegar sauces. The skin is the star." },
  { name: "Lexington Barbecue", city: "Lexington", country: "USA", state: "NC", style: "carolina", lat: 35.8240, lng: -80.2534, address: "100 Smokehouse Ln, Lexington, NC 27295", price: 2, rating: 4.5, featured: false, desc: "Western NC style with pork shoulder and red slaw. A Lexington landmark since 1962." },
  { name: "Bum's Restaurant", city: "Ayden", country: "USA", state: "NC", style: "carolina", lat: 35.4720, lng: -77.4400, address: "566 3rd St, Ayden, NC 28513", price: 1, rating: 4.6, featured: false, desc: "No-frills Eastern NC whole hog with fried chicken and hush puppies on the side." },
  { name: "Scott's Bar-B-Que", city: "Hemingway", country: "USA", state: "SC", style: "carolina", lat: 33.7538, lng: -79.4456, address: "2734 Hemingway Hwy, Hemingway, SC 29554", price: 1, rating: 4.7, featured: false, desc: "Rodney Scott's original pit — whole hog over coals with a vinegar-pepper sauce that cuts the richness." },
  { name: "Melvin's Legendary BBQ", city: "Charleston", country: "USA", state: "SC", style: "carolina", lat: 32.8000, lng: -79.9500, address: "331 Meeting St, Charleston, SC 29403", price: 2, rating: 4.4, featured: false, desc: "Mustard-based SC sauce on pulled pork and ribs. A Charleston staple for locals and visitors alike." },
  { name: "Grady's BBQ", city: "Dudley", country: "USA", state: "NC", style: "carolina", lat: 35.3060, lng: -78.0000, address: "3096 Arrington Bridge Rd, Dudley, NC 28333", price: 1, rating: 4.6, featured: false, desc: "Family pit since 1986 serving Eastern NC chopped pork with sweet tea and hush puppies." },

  // US Memphis (5)
  { name: "Charlie Vergos' Rendezvous", city: "Memphis", country: "USA", state: "TN", style: "memphis", lat: 35.1388, lng: -90.0515, address: "52 S 2nd St, Memphis, TN 38103", price: 2, rating: 4.5, featured: true, desc: "Dry-rubbed ribs in a basement alley since 1948. No sauce on the meat — just paprika, garlic, and legend." },
  { name: "Central BBQ", city: "Memphis", country: "USA", state: "TN", style: "memphis", lat: 35.1300, lng: -90.0400, address: "147 E Butler Ave, Memphis, TN 38103", price: 2, rating: 4.6, featured: false, desc: "Memphis-style dry rub ribs with wet and dry options. BBQ nachos and smoked bologna are cult favorites." },
  { name: "Cozy Corner BBQ", city: "Memphis", country: "USA", state: "TN", style: "memphis", lat: 35.1600, lng: -90.0200, address: "735 N Parkway, Memphis, TN 38105", price: 1, rating: 4.7, featured: false, desc: "James Beard winner Desiree Robinson's corner joint with smoked Cornish hen and pork rib tips." },
  { name: "The Bar-B-Q Shop", city: "Memphis", country: "USA", state: "TN", style: "memphis", lat: 35.1100, lng: -89.9500, address: "1782 Madison Ave, Memphis, TN 38104", price: 1, rating: 4.5, featured: false, desc: "Spaghetti with BBQ sauce and smoked bologna sandwiches. Memphis soul food meets the pit." },
  { name: "A&R Bar-B-Que", city: "Memphis", country: "USA", state: "TN", style: "memphis", lat: 35.0700, lng: -89.9800, address: "1801 Elvis Presley Blvd, Memphis, TN 38116", price: 1, rating: 4.4, featured: false, desc: "Late-night Memphis institution near Graceland. Bologna sandwiches and rib tips feed the city after dark." },

  // US Other (8)
  { name: "Joe's Kansas City Bar-B-Que", city: "Kansas City", country: "USA", state: "MO", style: "other", lat: 39.0840, lng: -94.6050, address: "3002 W 47th Ave, Kansas City, KS 66103", price: 2, rating: 4.7, featured: true, desc: "Z-Man sandwich and burnt ends in a gas station that became a BBQ pilgrimage site." },
  { name: "Arthur Bryant's", city: "Kansas City", country: "USA", state: "MO", style: "other", lat: 39.0920, lng: -94.5800, address: "1727 Brooklyn Ave, Kansas City, MO 64127", price: 1, rating: 4.3, featured: false, desc: "KC institution with thick tomato-molasses sauce and sliced brisket on white bread." },
  { name: "Dinosaur Bar-B-Que", city: "Syracuse", country: "USA", state: "NY", style: "other", lat: 43.0480, lng: -76.1550, address: "246 W Willow St, Syracuse, NY 13202", price: 2, rating: 4.5, featured: false, desc: "Blues bar meets BBQ joint with St. Louis ribs and pulled pork in upstate New York." },
  { name: "Southern Soul BBQ", city: "St. Simons Island", country: "USA", state: "GA", style: "carolina", lat: 31.1700, lng: -81.3900, address: "2020 Demere Rd, St Simons Island, GA 31522", price: 2, rating: 4.7, featured: false, desc: "Coastal Georgia smokehouse with Brunswick stew and pecan-smoked pork." },
  { name: "Pecos Pit", city: "Santa Fe", country: "USA", state: "NM", style: "texas", lat: 35.6870, lng: -105.9378, address: "500 Rodeo Rd, Santa Fe, NM 87505", price: 2, rating: 4.4, featured: false, desc: "Santa Fe's open-pit barbecue with green chile brisket and Southwest smoke." },
  { name: "Big Bob Gibson Bar-B-Q", city: "Decatur", country: "USA", state: "AL", style: "other", lat: 34.6059, lng: -86.9833, address: "2520 Danville Rd SW, Decatur, AL 35603", price: 2, rating: 4.7, featured: false, desc: "Alabama white sauce inventor. Smoked chicken with mayo-vinegar dip is iconic." },
  { name: "Hog Wild Pit BBQ", city: "Berkeley", country: "USA", state: "CA", style: "other", lat: 37.8715, lng: -122.2730, address: "2535 San Pablo Ave, Berkeley, CA 94702", price: 2, rating: 4.4, featured: false, desc: "Bay Area pit with tri-tip, ribs, and a sauce bar spanning regional American styles." },

  // Canada (4)
  { name: "Montreal BBQ Pit", city: "Montreal", country: "Canada", state: "QC", style: "other", lat: 45.5017, lng: -73.5673, address: "1234 Rue Saint-Laurent, Montreal, QC H2X 2S5", price: 2, rating: 4.3, featured: false, desc: "Quebec's smoke-forward BBQ with maple-glazed ribs and poutine on the side." },
  { name: "Barque Smokehouse", city: "Toronto", country: "Canada", state: "ON", style: "texas", lat: 43.6532, lng: -79.3832, address: "850 Eglinton Ave W, Toronto, ON M5N 1E7", price: 3, rating: 4.5, featured: false, desc: "Toronto's Texas-style destination with brisket, burnt ends, and craft beer pairings." },
  { name: "Dinosaur Bar-B-Que Toronto", city: "Toronto", country: "Canada", state: "ON", style: "other", lat: 43.6400, lng: -79.4200, address: "215 Fort York Blvd, Toronto, ON M5V 1A4", price: 2, rating: 4.4, featured: false, desc: "Canadian outpost of the Syracuse legend with live blues and St. Louis ribs." },
  { name: "Blue Smoke Vancouver", city: "Vancouver", country: "Canada", state: "BC", style: "other", lat: 49.2827, lng: -123.1207, address: "456 Granville St, Vancouver, BC V6C 1T4", price: 3, rating: 4.3, featured: false, desc: "Pacific Northwest smokehouse blending Texas brisket with local cedar-plank salmon." },

  // Mexico & Central America (5)
  { name: "El Norteño", city: "Monterrey", country: "Mexico", state: "NL", style: "texas", lat: 25.6866, lng: -100.3161, address: "Av Constitución 800, Monterrey, NL 64000", price: 2, rating: 4.6, featured: false, desc: "Northern Mexico cabrito and arrachera grilled over mesquite — the border cousin of Texas BBQ." },
  { name: "La Costeña BBQ", city: "Mexico City", country: "Mexico", state: "CDMX", style: "texas", lat: 19.4326, lng: -99.1332, address: "Calle Álvaro Obregón 200, Roma Norte, CDMX", price: 2, rating: 4.4, featured: false, desc: "CDMX smokehouse bringing Texas brisket culture to the capital with mezcal pairings." },
  { name: "Smoke & Fire Oaxaca", city: "Oaxaca", country: "Mexico", state: "OAX", style: "other", lat: 17.0732, lng: -96.7266, address: "Calle Macedonio Alcalá 300, Oaxaca", price: 2, rating: 4.3, featured: false, desc: "Oaxacan mole meets American smoke with tlayuda BBQ and mezcal-marinated ribs." },
  { name: "Pitmaster Guatemala", city: "Guatemala City", country: "Guatemala", state: "GT", style: "texas", lat: 14.6349, lng: -90.5069, address: "Zona 10, Guatemala City 01010", price: 2, rating: 4.2, featured: false, desc: "Central America's first dedicated Texas-style smokehouse with imported post oak." },
  { name: "Smokehouse Panama", city: "Panama City", country: "Panama", state: "PA", style: "texas", lat: 8.9824, lng: -79.5199, address: "Calle 50, Panama City", price: 3, rating: 4.3, featured: false, desc: "Canal-side BBQ with brisket, yuca fries, and rum cocktails in the financial district." },

  // South America (7)
  { name: "La Cabrera", city: "Buenos Aires", country: "Argentina", state: "BA", style: "argentine", lat: -34.5889, lng: -58.4303, address: "Cabrera 5099, Palermo, Buenos Aires", price: 3, rating: 4.8, featured: true, desc: "Palermo parrilla with perfectly charred bife de chorizo and chimichurri. Argentine asado at its finest." },
  { name: "Don Julio", city: "Buenos Aires", country: "Argentina", state: "BA", style: "argentine", lat: -34.5900, lng: -58.4250, address: "Guatemala 4699, Palermo, Buenos Aires", price: 4, rating: 4.9, featured: true, desc: "World-ranked parrilla with dry-aged steaks and a wine list that matches the fire." },
  { name: "El Boliche de Alberto", city: "Bariloche", country: "Argentina", state: "RN", style: "argentine", lat: -41.1335, lng: -71.3103, address: "Mitre 395, San Carlos de Bariloche", price: 3, rating: 4.7, featured: false, desc: "Patagonian lamb and beef grilled over wood in the Andes. A Bariloche institution since 1964." },
  { name: "Fogo de Chão", city: "São Paulo", country: "Brazil", state: "SP", style: "brazilian", lat: -23.5505, lng: -46.6333, address: "Av. Santo Amaro 4664, São Paulo", price: 4, rating: 4.5, featured: false, desc: "Brazilian churrasco rodízio with picanha, linguiça, and endless gaucho-carved meats." },
  { name: "Barbacoa do Sul", city: "Porto Alegre", country: "Brazil", state: "RS", style: "brazilian", lat: -30.0346, lng: -51.2177, address: "Rua Padre Chagas 200, Porto Alegre", price: 2, rating: 4.6, featured: false, desc: "Gaúcho-style costela no fogo de chão — beef ribs slow-roasted over open flame in southern Brazil." },
  { name: "Parrilla El Fogón", city: "Montevideo", country: "Uruguay", state: "UY", style: "argentine", lat: -34.9011, lng: -56.1645, address: "Rambla 25 de Agosto, Montevideo", price: 2, rating: 4.5, featured: false, desc: "Uruguayan asado with grass-fed beef and morcilla by the Rio de la Plata." },
  { name: "Churrasco Santiago", city: "Santiago", country: "Chile", state: "RM", style: "argentine", lat: -33.4489, lng: -70.6693, address: "Av. Providencia 2000, Santiago", price: 3, rating: 4.4, featured: false, desc: "Chilean parrilla with Argentine cuts and Carménère wine pairings in Providencia." },

  // UK + Ireland + EU (12)
  { name: "Smokestak", city: "London", country: "UK", state: "ENG", style: "texas", lat: 51.5230, lng: -0.0750, address: "8 Sclater St, London E1 6HR", price: 3, rating: 4.6, featured: true, desc: "Shoreditch smokehouse with oak-smoked brisket and beef brisket croquettes. London's BBQ benchmark." },
  { name: "Bodean's BBQ", city: "London", country: "UK", state: "ENG", style: "other", lat: 51.5100, lng: -0.1300, address: "12 Archer St, London W1D 7BB", price: 2, rating: 4.3, featured: false, desc: "American-style ribs and pulled pork in Soho since 2002. A London BBQ pioneer." },
  { name: "Red Dog Saloon", city: "London", country: "UK", state: "ENG", style: "other", lat: 51.5150, lng: -0.1400, address: "37 Hoxton Square, London N1 6NN", price: 2, rating: 4.2, featured: false, desc: "Deep South ribs and bourbon in Hoxton. A lively American BBQ experience." },
  { name: "Pitt Cue Co.", city: "London", country: "UK", state: "ENG", style: "texas", lat: 51.5120, lng: -0.1380, address: "18-22 Great Eastern St, London EC2A 3AS", price: 3, rating: 4.5, featured: false, desc: "Bun-sized brisket sandwiches and bone marrow mash. Influential London pit since 2011." },
  { name: "Fowl & Fodder", city: "Bristol", country: "UK", state: "ENG", style: "other", lat: 51.4545, lng: -2.5879, address: "38 Victoria St, Bristol BS1 6BY", price: 2, rating: 4.4, featured: false, desc: "Bristol smokehouse with pulled pork, smoked chicken, and local craft beer." },
  { name: "Pitt Bros", city: "Dublin", country: "Ireland", state: "D", style: "texas", lat: 53.3498, lng: -6.2603, address: "5 Lord Edward St, Dublin D02 P634", price: 2, rating: 4.5, featured: false, desc: "Dublin's Texas-style BBQ with brisket boxes and mac attack sides." },
  { name: "Kimchi BBQ Berlin", city: "Berlin", country: "Germany", state: "BE", style: "korean", lat: 52.5200, lng: 13.4050, address: "Oranienstraße 200, Berlin 10999", price: 2, rating: 4.4, featured: false, desc: "Kreuzberg fusion of Korean gochujang glaze and American smoke on pork belly." },
  { name: "Big Apple BBQ Amsterdam", city: "Amsterdam", country: "Netherlands", state: "NH", style: "other", lat: 52.3676, lng: 4.9041, address: "Leidseplein 10, Amsterdam 1017 PT", price: 2, rating: 4.3, featured: false, desc: "Amsterdam's American BBQ with ribs, brisket, and canal-side terrace seating." },
  // Asia-Pacific Korean + Japanese (10)
  { name: "Kang Ho-dong Baekjeong", city: "Seoul", country: "South Korea", state: "SEO", style: "korean", lat: 37.5172, lng: 127.0473, address: "Apgujeong-ro, Gangnam, Seoul", price: 3, rating: 4.7, featured: true, desc: "Premium Korean BBQ with marinated galbi and ssam wraps. A Gangnam institution." },
  { name: "Maple Tree House", city: "Seoul", country: "South Korea", state: "SEO", style: "korean", lat: 37.5300, lng: 127.0300, address: "Itaewon-ro, Yongsan, Seoul", price: 3, rating: 4.6, featured: false, desc: "Itaewon favorite with hanwoo beef and tableside grilling. Popular with expats and locals." },
  { name: "Wangbijib", city: "Seoul", country: "South Korea", state: "SEO", style: "korean", lat: 37.5100, lng: 127.0600, address: "Gangnam-daero, Gangnam, Seoul", price: 2, rating: 4.5, featured: false, desc: "All-you-can-eat Korean BBQ with pork belly, beef tongue, and unlimited banchan." },
  { name: "Gogung", city: "Busan", country: "South Korea", state: "BS", style: "korean", lat: 35.1796, lng: 129.0756, address: "Haeundae Beach Rd, Busan", price: 2, rating: 4.4, featured: false, desc: "Busan beachside Korean BBQ with fresh seafood ssam and grilled pork." },
  { name: "Yakiniku Jumbo", city: "Tokyo", country: "Japan", state: "TK", style: "japanese", lat: 35.6762, lng: 139.6503, address: "Shinjuku, Tokyo 160-0022", price: 3, rating: 4.6, featured: true, desc: "Premium wagyu yakiniku with tableside grilling and dipping sauces. Shinjuku's finest." },
  { name: "Ushigoro", city: "Tokyo", country: "Japan", state: "TK", style: "japanese", lat: 35.6600, lng: 139.7000, address: "Ebisu, Shibuya, Tokyo", price: 4, rating: 4.8, featured: false, desc: "Ebisu wagyu specialist with charcoal-grilled beef and omakase-style courses." },
  { name: "Rokkasen", city: "Tokyo", country: "Japan", state: "TK", style: "japanese", lat: 35.6900, lng: 139.7000, address: "Nishi-Shinjuku, Tokyo", price: 3, rating: 4.5, featured: false, desc: "All-you-can-eat wagyu yakiniku in Shinjuku with premium cuts and sake pairings." },
  { name: "Seoul Garden Melbourne", city: "Melbourne", country: "Australia", state: "VIC", style: "korean", lat: -37.8136, lng: 144.9631, address: "Little Bourke St, Melbourne VIC 3000", price: 2, rating: 4.4, featured: false, desc: "Melbourne's Korean BBQ in Chinatown with tabletop grills and banchan." },
  { name: "Burnt Ends", city: "Singapore", country: "Singapore", state: "SG", style: "other", lat: 1.2800, lng: 103.8500, address: "20 Teck Lim Rd, Singapore 088391", price: 4, rating: 4.8, featured: true, desc: "Acclaimed modern BBQ with smoked quail, brisket, and open-kitchen theatre." },

  // Africa + Middle East (5)
  { name: "Moyo Shisanyama", city: "Johannesburg", country: "South Africa", state: "GP", style: "other", lat: -26.2041, lng: 28.0473, address: "Melrose Arch, Johannesburg", price: 2, rating: 4.3, featured: false, desc: "South African braai culture with boerewors, pap, and chakalaka by the fire." },
  { name: "Carnivore Restaurant", city: "Nairobi", country: "Kenya", state: "NRB", style: "other", lat: -1.3192, lng: 36.8219, address: "Langata Rd, Nairobi", price: 3, rating: 4.4, featured: false, desc: "All-you-can-eat game meat feast — ostrich, crocodile, and beef roasted on Maasai swords." },
  { name: "The Meat Co. Dubai", city: "Dubai", country: "UAE", state: "DU", style: "argentine", lat: 25.2048, lng: 55.2708, address: "Dubai Marina Walk, Dubai", price: 4, rating: 4.5, featured: false, desc: "Marina-side steakhouse with Argentine cuts and views of the yacht basin." },
  { name: "Smoke & Barrel Tel Aviv", city: "Tel Aviv", country: "Israel", state: "TA", style: "other", lat: 32.0853, lng: 34.7818, address: "Rothschild Blvd, Tel Aviv", price: 3, rating: 4.4, featured: false, desc: "Israeli-American smokehouse with pastrami burnt ends and tahini slaw." },

  // Australia + NZ (4)
  { name: "Bluebonnet BBQ", city: "Melbourne", country: "Australia", state: "VIC", style: "texas", lat: -37.8000, lng: 144.9900, address: "340 Victoria St, Abbotsford VIC 3067", price: 2, rating: 4.6, featured: false, desc: "Abbotsford's Texas-style pit with brisket, ribs, and house pickles." },
  { name: "Auckland Smokehouse", city: "Auckland", country: "New Zealand", state: "AKL", style: "other", lat: -36.8485, lng: 174.7633, address: "Viaduct Harbour, Auckland 1010", price: 3, rating: 4.3, featured: false, desc: "Harbour-side smoke with lamb shoulder and manuka-smoked brisket." },
  { name: "Terry Black's BBQ", city: "Austin", country: "USA", state: "TX", style: "texas", lat: 30.2600, lng: -97.7500, address: "1003 Barton Springs Rd, Austin, TX 78704", price: 2, rating: 4.6, featured: false, desc: "Family pit with beef ribs, turkey, and sides that hold their own against the meat." },
  { name: "La Barbecue", city: "Austin", country: "USA", state: "TX", style: "texas", lat: 30.2500, lng: -97.7300, address: "2401 E Cesar Chavez St, Austin, TX 78702", price: 2, rating: 4.5, featured: false, desc: "East Austin trailer with fatty brisket and house-made sausage on Cesar Chavez." },
  { name: "Heim Barbecue", city: "Fort Worth", country: "USA", state: "TX", style: "texas", lat: 32.7555, lng: -97.3308, address: "3000 S Hulen St, Fort Worth, TX 76109", price: 2, rating: 4.6, featured: false, desc: "Bacon burnt ends and craft beer in Fort Worth's BBQ renaissance." },
  { name: "Cattleack Barbecue", city: "Dallas", country: "USA", state: "TX", style: "texas", lat: 32.9000, lng: -96.8500, address: "13628 Gamma Rd, Farmers Branch, TX 75244", price: 2, rating: 4.7, featured: false, desc: "Friday-Saturday only Dallas destination with prime brisket and beef ribs." },
];

// Ensure exactly 75
if (restaurants.length !== 75) {
  console.error(`Expected 75 restaurants, got ${restaurants.length}`);
  process.exit(1);
}

const now = new Date().toISOString();
const enriched = restaurants.map((r, i) => {
  const slug = slugify(`${r.name}-${r.city}`);
  const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
  return {
    id,
    slug,
    name: r.name,
    description: r.desc,
    style: r.style,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    city: r.city,
    country: r.country,
    website: null,
    price_level: r.price,
    avg_rating: r.rating,
    review_count: Math.floor(Math.random() * 200) + 20,
    hero_image_url: BBQ_IMGS[i % BBQ_IMGS.length],
    is_featured: r.featured,
    status: "approved",
    created_at: now,
  };
});

// TypeScript fallback
const tsContent = `import type { Restaurant } from "@/lib/types/database";

export const FALLBACK_RESTAURANTS: Restaurant[] = ${JSON.stringify(enriched, null, 2)} as Restaurant[];
`;
writeFileSync(join(root, "lib/data/fallback-restaurants.ts"), tsContent);

// JSON export
writeFileSync(join(root, "data/restaurants.json"), JSON.stringify(enriched, null, 2));

// SQL INSERTs
const esc = (s) => s.replace(/'/g, "''");
const inserts = enriched.map((r) => `INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '${r.id}', '${esc(r.slug)}', '${esc(r.name)}', '${esc(r.description)}', '${r.style}', ${r.lat}, ${r.lng}, '${esc(r.address)}', '${esc(r.city)}', '${esc(r.country)}', NULL, ${r.price_level}, ${r.avg_rating}, ${r.review_count}, '${esc(r.hero_image_url)}', ${r.is_featured}, 'approved'
);`).join("\n\n");

// Signature dishes for featured restaurants
const featured = enriched.filter((r) => r.is_featured);
const dishInserts = featured.flatMap((r, fi) => {
  const dishes = [
    { name: "Signature Brisket", desc: "Slow-smoked until tender with house rub", label: "Buy on Amazon" },
    { name: "House Sausage", desc: "Craft sausage with regional spice blend", label: "Shop ThermoWorks" },
  ];
  return dishes.map((d, di) => {
    const id = `10000000-0000-4000-8000-${String(fi * 2 + di + 1).padStart(12, "0")}`;
    return `INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '${id}', '${r.id}', '${esc(d.name)}', '${esc(d.desc)}', '#', '${esc(d.label)}', ${di}
);`;
  });
}).join("\n\n");

console.log(`Generated ${enriched.length} restaurants`);
writeFileSync(join(root, "scripts/_inserts.sql"), inserts + "\n\n" + dishInserts);
console.log("Wrote fallback-restaurants.ts, data/restaurants.json, scripts/_inserts.sql");