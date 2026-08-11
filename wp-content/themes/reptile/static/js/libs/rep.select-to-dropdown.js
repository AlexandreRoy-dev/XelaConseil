/*

    Select-to-dropdown
    By Maxime Côté

    When you want a select to become a more beautiful dropdown,
    wrap the select in a .js-select-to-dropdown div.

    It will automatically convert the select into the dropdown template used by dropdown.js

 */

function reptile_select_to_dropdown (selector) {
    $(selector).each(function() {

        var $select = $(this).find('select');

        if($select) {

            var dropdownName = $select.find('option:selected').length > 0 ? $select.find('option:selected').text() : $select.find('option').first().text();
            var $dropdown = $('<div class="dropdown js-dropdown">');
            var customClasses = $(this).attr('data-custom-classes');
            var $dropdownList = null;

            // Since we hide the select via CSS, we need to remove 'required' because if we try to submit the form and the value of the select is empty,
            // the form won't submit as the field is required, but we won't see the error as the select is hidden.
            $select.prop('required', false);

            if(customClasses !== '') {
                $dropdown.addClass(customClasses);
            }

            $dropdown
                .append('<a class="dropdown__link js-dropdown-link" href="#">' + dropdownName + '</a>')
                .append('<ul class="dropdown__list js-dropdown-list">');

            $dropdownList = $dropdown.find('ul');

            $select
                .find('option')
                .each(function() {
                    $dropdownList.append('<li><span data-value="' + $(this).attr('value') + '" data-name="' + $(this).attr('name') + '" data-email="' + $(this).attr('email') + '">' + $(this).text() + '</span></li>')
                });
            $dropdown.prepend($select);
            $(this).append($dropdown);
        }

    });
};
reptile_select_to_dropdown ('.js-select-to-dropdown')