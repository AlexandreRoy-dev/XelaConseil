/*

    Dropdown.js
    by Maxime Côté

    HTML structure must be :

    <div class="dropdown js-dropdown">
        <a class="dropdown__link js-dropdown-link" href="/">Dropdown name</a>
        <ul class="dropdown__list js-dropdown-list">
            <li class="dropdown__list-item">
                <a href="#">Option name</a>
            </li>
            <li class="dropdown__list-item">
                <a href="#">Option name</a>
            </li>
        </ul>
    </div>

    Must include _dropdown.sass.

    If you want the dropdown__list to push the content below instead of being over it:
        - Add the 'dropdown__list--pos-static' class ot it.

    If you want the dropdown__link to be underlined:
        - Add the 'dropdown__link--underlined' to it.

    If you want to change the slide animation duration:
        - Add a parameter to the slideUp and slideDown function calls (in ms).

    When clicking on a dropdown__list-item span:
        - It updates the dropdown__link with the text, adds an 'is-selected' class to it,
        and makes the dropdown trigger a 'change' event, as a select would do.

    When clicking on a dropdown__list-item span or a:
        - It adds an 'is-dirty' class to the dropdown

 */


function reptile_dropdown () {
    var $dropdowns = $('.js-dropdown');
    var classToToggle = 'is-opened';

    function closeOpenedDropdown() {

        $('.dropdown')
            .filter('.' + classToToggle)
            .find('.js-dropdown-list')
            .slideUp()
            .end()
            .removeClass(classToToggle);

        $(window).unbind('click.dropdown-window');
    }

    // Toggling the dropdown content on click on the link
    // Also add a window listener when we click outside an opened dropdown to close it
    $('.js-dropdown-link').on("click", function(e) {
        var $dropdown = $(this).closest('.js-dropdown');
        var $dropdownList = $('.js-dropdown-list', $dropdown);

        if(!$dropdown.hasClass(classToToggle)) {
            // Close already opened dropdown if it exists
            if($('.dropdown').filter('.' + classToToggle).length > 0) {
                closeOpenedDropdown();
            }
            $dropdownList.slideDown();
            $dropdown.addClass(classToToggle);
            // Closing the dropdown when we click outside of it
            $(window)
                .unbind('click.dropdown-window')
                .bind('click.dropdown-window', function(e) {
                    if($dropdown.find($(e.target)).length === 0) {
                        closeOpenedDropdown();
                    }
                })
        }
        else {
            closeOpenedDropdown();
        }
        e.preventDefault();
        e.stopImmediatePropagation();
    });

    // When we click on a dropdown item, if it is a span, we update the link text and trigger a change event
    $('.js-dropdown-list li span').click(function() {

        var $dropdown = $(this).closest('.js-dropdown');
        var $dropdownLink = $dropdown.find('.js-dropdown-link');
        var $dropdownSelect = $dropdown.find('select');
        var $clickedDropdownListItemSpan =  $(this);

        $('.js-dropdown-list li span', $dropdown).removeClass('is-selected');
        $clickedDropdownListItemSpan.addClass('is-selected');

        $dropdownLink.text($clickedDropdownListItemSpan.text());

        if($dropdownSelect.length > 0) {
            $dropdownSelect
                .val($clickedDropdownListItemSpan.attr('data-value'))
                .change();
        }
        else {
            $dropdown.trigger('change');
        }

        closeOpenedDropdown();

    });

    $('.js-dropdown select').change(function(e) {

        var $dropdown = $(e.target).closest('.js-dropdown');
        var $dropdownLink = $dropdown.find('.js-dropdown-link');
        var newValueOfSelect = $(this).val();

        $('.js-dropdown-list li span', $dropdown)
            .removeClass('is-selected')
            .filter(function() {
                return $(this).data('value') == newValueOfSelect
            })
            .addClass('is-selected');

        $dropdownLink.text($(this).find('option:selected').text());

    });

    // Add a 'is-dirty' class when a dropdown value has been selected the first time
    $dropdowns.one('change', function() {
        $(this).addClass('is-dirty');
    });
    
};
reptile_dropdown ()