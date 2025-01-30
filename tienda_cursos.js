// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBikggLtX1nwc1OXWUvDKXFm6P_hAdAe-Y",
    authDomain: "plataforma-de-cursos-esys.firebaseapp.com",
    projectId: "plataforma-de-cursos-esys",
    storageBucket: "plataforma-de-cursos-esys.firebasestorage.app",
    messagingSenderId: "950684050808",
    appId: "1:950684050808:web:33d2ef70f2343642f4548d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let cart = []; // Carrito de compras
let courseDiscounts = {}; // Almacenar descuentos desde Firebase

// Cargar cursos y descuentos desde Firebase
document.addEventListener("DOMContentLoaded", async () => {
    const courseList = document.getElementById("course-list");
    try {
        const snapshot = await db.collection('courses').get();
        snapshot.forEach((doc) => {
            const course = doc.data();
            courseDiscounts[doc.id] = course.discounts || [];
            
            const courseCard = document.createElement("div");
            courseCard.className = "course-card";
            courseCard.innerHTML = `
                <div class="course-container">
                    <img src="${course.imageURL}" alt="${course.name}" class="course-image" style="max-width: 180px; height: auto; display: block; margin: auto; border-radius: 8px; box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);">
                    <h3>${course.name}</h3>
                    <p class="price">Precio: <strong>$${course.price.toLocaleString("es-CL")}</strong></p>
                    <div class="course-actions" style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <div class="quantity-wrapper" style="display: flex; align-items: center; gap: 10px;">
                            <button class="quantity-btn" style="padding: 5px 12px; border-radius: 5px; font-size: 16px;" onclick="adjustQuantity('${doc.id}', -1)">-</button>
                            <input type="text" id="quantity-${doc.id}" value="1" class="quantity-input" style="width: 50px; text-align: center; font-size: 18px; border-radius: 5px; border: 1px solid #ccc; padding: 5px;">
                            <button class="quantity-btn" style="padding: 5px 12px; border-radius: 5px; font-size: 16px;" onclick="adjustQuantity('${doc.id}', 1)">+</button>
                        </div>
                        <button class="add-to-cart" data-id="${doc.id}" data-name="${course.name}" data-price="${course.price}" style="margin-top: 0px; background-color:rgb(24, 172, 56); color: white; padding: 0px 18px; border: none; border-radius: 5px; height: 30px; width: 150px; cursor: pointer; font-weight: bold;">Agregar al Carrito</button>
                    </div>
                </div>
            `;
            courseList.appendChild(courseCard);
        });

        document.querySelectorAll(".add-to-cart").forEach(button => {
            button.addEventListener("click", (event) => {
                const courseId = event.target.getAttribute("data-id");
                const courseName = event.target.getAttribute("data-name");
                const coursePrice = parseFloat(event.target.getAttribute("data-price"));
                const quantityInput = document.getElementById(`quantity-${courseId}`);
                const quantity = parseInt(quantityInput.value, 10);
                
                if (isNaN(quantity) || quantity <= 0) {
                    alert("Ingrese una cantidad válida");
                    return;
                }
                
                addToCart(courseId, courseName, coursePrice, quantity);
            });
        });
    } catch (error) {
        console.error("Error al obtener los cursos: ", error);
    }
});

// Ajustar cantidad en la interfaz
function adjustQuantity(courseId, change) {
    const quantityInput = document.getElementById(`quantity-${courseId}`);
    let newQuantity = Math.max(1, parseInt(quantityInput.value, 10) + change);
    quantityInput.value = newQuantity;
}

// Aplicar descuentos según Firebase
function calculateDiscount(courseId, quantity, basePrice) {
    let applicableDiscount = 0;
    const discounts = courseDiscounts[courseId] || [];
    
    discounts.forEach(discount => {
        if (quantity >= discount.minQuantity) {
            applicableDiscount = Math.max(applicableDiscount, discount.discountPercentage);
        }
    });
    
    return Math.round(basePrice * quantity * (1 - applicableDiscount / 100));
}

// Agregar un curso al carrito
function addToCart(courseId, courseName, coursePrice, quantity) {
    const existingCourse = cart.find((item) => item.id === courseId);
    if (existingCourse) {
        existingCourse.quantity += quantity;
    } else {
        cart.push({ id: courseId, name: courseName, price: coursePrice, quantity, discounts: courseDiscounts[courseId] });
    }
    renderCart();
}

// Eliminar un curso del carrito
function removeFromCart(courseId) {
    cart = cart.filter(item => item.id !== courseId);
    renderCart();
}

// Renderizar el carrito
function renderCart() {
    const cartItems = document.getElementById("cart-items");
    const totalAmount = document.getElementById("total-amount");
    const checkoutContainer = document.getElementById("checkout-container");


cartItems.innerHTML = ""; // Limpiar el contenido antes de actualizar
let total= 0;
cart.forEach((course) => {
    const discountedPrice = calculateDiscount(course.id, course.quantity, course.price);
    total += discountedPrice; // Sumar el precio del curso al total

    const cartItem = document.createElement("div");
    cartItem.className = "cart-item-container";
    cartItem.style.display = "flex";
    cartItem.style.alignItems = "center";
    cartItem.style.justifyContent = "space-between";
    cartItem.style.padding = "10px";
    cartItem.style.border = "1px solid #ccc";
    cartItem.style.borderRadius = "8px";
    cartItem.style.backgroundColor = "#fff";
    cartItem.style.marginBottom = "10px";

    cartItem.innerHTML = `
        <span class="cart-item-name">${course.name}</span>
        <div class="quantity-wrapper">
            <button class="quantity-btn" style="padding: 5px 12px; border-radius: 5px; font-size: 16px; background-color: #007bff; color: white; border: none;" onclick="updateCartQuantity('${course.id}', -1)">-</button>
            <input type="text" value="${course.quantity}" class="quantity-input" style="width: 50px; text-align: center; font-size: 18px; border-radius: 5px; border: 1px solid #ccc; padding: 5px;">
            <button class="quantity-btn" style="padding: 5px 12px; border-radius: 5px; font-size: 16px; background-color: #007bff; color: white; border: none;" onclick="updateCartQuantity('${course.id}', 1)">+</button>
        </div>
        <span class="price">$${calculateDiscount(course.id, course.quantity, course.price).toLocaleString("es-CL")}</span>
        <button onclick="removeFromCart('${course.id}')" class="remove-button" style="padding: 5px 12px; border-radius: 5px; font-size: 16px; background-color:rgb(211, 0, 0); color: white; border: none;" >Eliminar</button>
    `;
    cartItems.appendChild(cartItem);

    });

    totalAmount.textContent = `$${total.toLocaleString("es-CL")}`;
    checkoutContainer.style.display = "flex";
    checkoutContainer.style.justifyContent = "flex-end";
    checkoutContainer.style.alignItems = "center";
    checkoutContainer.style.marginTop = "20px";
    checkoutContainer.style.textAlign = "right";
}

// Modificar cantidad en el carrito
function updateCartQuantity(courseId, change) {
    const course = cart.find(item => item.id === courseId);
    if (course) {
        course.quantity = Math.max(1, course.quantity + change);
        renderCart();
    }
}

// Permitir cambiar la cantidad manualmente con Enter
document.addEventListener("input", (event) => {
    if (event.target.classList.contains("quantity-input")) {
        event.target.addEventListener("keypress", function (e) {
            if (e.key === "Enter") {
                const courseId = event.target.closest(".cart-item-container").querySelector(".quantity-btn").getAttribute("onclick").match(/'([^']+)'/)[1];
                const newQuantity = parseInt(event.target.value, 10);
                if (!isNaN(newQuantity) && newQuantity > 0) {
                    const course = cart.find(item => item.id === courseId);
                    if (course) {
                        course.quantity = newQuantity;
                        renderCart();
                    }
                }
            }
        });
    }
});

async function processCheckout() {
    if (cart.length === 0) {
        alert("El carrito está vacío. Agrega cursos antes de proceder al pago.");
        return;
    }

    let totalAmount = cart.reduce((sum, course) => sum + calculateDiscount(course.id, course.quantity, course.price), 0);

    try {
        const response = await fetch("https://creartransaccionwebpay-wf5bhi5ova-uc.a.run.app", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                amount: totalAmount,
                items: cart.map(course => ({
                    id: course.id,
                    name: course.name,
                    quantity: course.quantity,
                    price: calculateDiscount(course.id, course.quantity, course.price)
                }))
            })
        });

        const data = await response.json();

        if (data.url && data.token) {
            // Convertimos el carrito en un string JSON y lo pasamos en la URL
            const carritoEncoded = encodeURIComponent(JSON.stringify(cart));
            window.location.href = `${data.url}?token_ws=${data.token}&cart=${carritoEncoded}`;
        } else {
            alert("Error al iniciar el pago. Intenta nuevamente.");
        }
    } catch (error) {
        console.error("Error al conectar con Webpay:", error);
        alert("Hubo un problema al procesar el pago.");
    }
}



document.addEventListener("DOMContentLoaded", () => {
    const checkoutButton = document.getElementById("checkout-button");
    
    if (checkoutButton) {
        checkoutButton.addEventListener("click", processCheckout);
    } else {
        console.error("Error: Botón de pago no encontrado en el DOM");
    }
});
