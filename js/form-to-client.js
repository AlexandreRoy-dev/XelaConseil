(function () {
  var FORMSPREE = "https://formspree.io/f/xppwajye";

  var APPOINTMENT = {
    honeypot: "input_30",
    prenom: "input_6",
    nom: "input_12",
    courriel: "input_5",
    telephone: "input_28",
    entreprise: "input_13",
    chiffreAffaires: "input_20",
    employes: "input_21",
    vousEtes: "input_23",
    source: "input_24",
    message: "input_26",
    utm_source: "input_16",
    utm_medium: "input_17",
    utm_campaign: "input_18",
    required: [
      "prenom",
      "nom",
      "courriel",
      "telephone",
      "entreprise",
      "chiffreAffaires",
      "employes",
      "vousEtes",
      "source",
      "message",
    ],
  };

  var CAREER = {
    honeypot: "input_10",
    prenom: "input_1",
    nom: "input_2",
    courriel: "input_3",
    telephone: "input_4",
    message: "input_6",
    file: "input_5",
    required: ["prenom", "nom", "courriel"],
  };

  function value(form, name) {
    var field = form.elements.namedItem(name);
    return field && "value" in field ? String(field.value).trim() : "";
  }

  function isEmail(text) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  }

  function fillUtm(form) {
    var params = new URLSearchParams(window.location.search);
    [
      ["utm_source", "input_16"],
      ["utm_medium", "input_17"],
      ["utm_campaign", "input_18"],
    ].forEach(function (pair) {
      var field = form.elements.namedItem(pair[1]);
      if (field && params.get(pair[0])) field.value = params.get(pair[0]);
    });
  }

  function statusBox(form) {
    var box = form.querySelector("[data-xela-form-status]");
    if (box) return box;
    box = document.createElement("p");
    box.setAttribute("data-xela-form-status", "");
    box.setAttribute("role", "status");
    box.style.margin = "16px 0 0";
    box.style.color = "#fff";
    box.style.fontSize = "15px";
    var footer = form.querySelector(".gform_footer") || form;
    footer.appendChild(box);
    return box;
  }

  function setStatus(form, text, isError) {
    var box = statusBox(form);
    box.textContent = text || "";
    box.style.color = isError ? "#ffd3c2" : "#fff";
  }

  function mapFields(form, spec) {
    var data = { page: window.location.href };
    Object.keys(spec).forEach(function (key) {
      if (key === "required" || key === "file") return;
      data[key] = value(form, spec[key]);
    });
    return data;
  }

  function validate(data, required) {
    for (var i = 0; i < required.length; i += 1) {
      if (!data[required[i]]) return "Veuillez remplir tous les champs obligatoires.";
    }
    if (!isEmail(data.courriel)) return "Entrez une adresse courriel valide.";
    if (data.telephone && data.telephone.replace(/\D/g, "").length < 10) {
      return "Entrez un numéro de téléphone valide.";
    }
    return "";
  }

  function toFormspreeBody(payload, file) {
    var name = [payload.prenom, payload.nom].filter(Boolean).join(" ");
    var kind = payload.form === "career" ? "Candidature" : "Rendez-vous";
    var body = {
      name: name,
      email: payload.courriel,
      telephone: payload.telephone || "",
      entreprise: payload.entreprise || "",
      chiffreAffaires: payload.chiffreAffaires || "",
      employes: payload.employes || "",
      vousEtes: payload.vousEtes || "",
      source: payload.source || "",
      message: payload.message || "",
      page: payload.page || "",
      utm_source: payload.utm_source || "",
      utm_medium: payload.utm_medium || "",
      utm_campaign: payload.utm_campaign || "",
      _subject: kind + " — " + (name || "site Xela Conseil"),
      _gotcha: payload.website || "",
      formulaire: kind,
    };

    if (!file) return { json: body };

    var data = new FormData();
    Object.keys(body).forEach(function (key) {
      if (body[key]) data.append(key, body[key]);
    });
    data.append("cv", file, file.name);
    return { formData: data };
  }

  function send(payload, file) {
    var packed = toFormspreeBody(payload, file);
    var options = packed.formData
      ? { method: "POST", headers: { Accept: "application/json" }, body: packed.formData }
      : {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(packed.json),
        };

    return fetch(FORMSPREE, options).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok || body.ok === false) {
          throw new Error((body.errors && body.errors[0] && body.errors[0].message) || body.error || "Send failed");
        }
        return body;
      });
    });
  }

  function confirmationUrl() {
    var parts = window.location.pathname.replace(/\/index\.html$/i, "").split("/").filter(Boolean);
    return parts.length === 0 ? "./confirmation/index.html" : "../confirmation/index.html";
  }

  function bind(form, spec, kind) {
    fillUtm(form);
    form.setAttribute("novalidate", "novalidate");
    form.addEventListener(
      "submit",
      function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (value(form, spec.honeypot)) return;

        var payload = mapFields(form, spec);
        payload.form = kind;
        payload.website = value(form, spec.honeypot);

        var error = validate(payload, spec.required);
        if (error) {
          setStatus(form, error, true);
          return;
        }

        var fileField = spec.file ? form.elements.namedItem(spec.file) : null;
        var file = fileField && fileField.files && fileField.files[0] ? fileField.files[0] : null;
        if (spec.required.indexOf("file") !== -1 && !file) {
          setStatus(form, "Ajoutez votre fichier.", true);
          return;
        }
        if (file && file.size > 5 * 1024 * 1024) {
          setStatus(form, "Le fichier doit faire moins de 5 Mo.", true);
          return;
        }

        var button = form.querySelector('[type="submit"]');
        if (button) button.disabled = true;
        setStatus(form, "Envoi en cours…", false);

        send(payload, file)
          .then(function () {
            window.location.assign(confirmationUrl());
          })
          .catch(function () {
            if (button) button.disabled = false;
            setStatus(
              form,
              "Envoi impossible pour le moment. Appelez le 450-300-3555 ou réessayez plus tard.",
              true
            );
          });
      },
      true
    );
  }

  function specFor(form) {
    var id = form.getAttribute("data-formid") || form.id.replace(/^gform_/, "");
    return id === "2" ? { spec: CAREER, kind: "career" } : { spec: APPOINTMENT, kind: "appointment" };
  }

  function init() {
    document.querySelectorAll(".ginput_recaptcha, .gfield--type-captcha").forEach(function (el) {
      el.style.display = "none";
    });

    document.querySelectorAll('form[id^="gform_"]').forEach(function (form) {
      if (form.dataset.xelaBound === "1") return;
      form.dataset.xelaBound = "1";
      var mapped = specFor(form);
      bind(form, mapped.spec, mapped.kind);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
